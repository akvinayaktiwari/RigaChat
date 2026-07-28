import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()

vi.mock('../lib/cognito-admin.js', () => ({
  cognitoAdminClient: { send },
}))

const { confirmSignup, forgotPassword, ForgotPasswordError } = await import('./auth-service.js')

function cognitoError(name: string, message = 'Cognito error'): Error {
  const error = new Error(message)
  error.name = name
  return error
}

beforeEach(() => {
  send.mockReset()
})

describe('confirmSignup', () => {
  it('confirms the user and marks their email verified', async () => {
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({})

    await confirmSignup('someone@example.com')

    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0][0].input).toMatchObject({ Username: 'someone@example.com' })
    expect(send.mock.calls[1][0].input).toMatchObject({
      Username: 'someone@example.com',
      UserAttributes: [{ Name: 'email_verified', Value: 'true' }],
    })
  })

  // Regression test for the bug this fixes: AdminConfirmSignUpCommand's
  // "already confirmed" error used to short-circuit before the account's
  // email_verified attribute was ever set, permanently breaking
  // forgot-password for that user.
  it('still marks email verified when the account was already confirmed', async () => {
    send.mockRejectedValueOnce(cognitoError('NotAuthorizedException')).mockResolvedValueOnce({})

    await confirmSignup('already-confirmed@example.com')

    expect(send).toHaveBeenCalledTimes(2)
  })

  it('is a no-op when the user does not exist', async () => {
    send.mockRejectedValueOnce(cognitoError('InvalidParameterException'))

    await confirmSignup('missing@example.com')

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('throws when confirmation fails for an unexpected reason', async () => {
    send.mockRejectedValueOnce(cognitoError('InternalErrorException', 'boom'))

    await expect(confirmSignup('someone@example.com')).rejects.toThrow(/boom/)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('throws when marking the email verified fails', async () => {
    send.mockResolvedValueOnce({}).mockRejectedValueOnce(cognitoError('InternalErrorException', 'boom'))

    await expect(confirmSignup('someone@example.com')).rejects.toThrow(/Failed to mark email verified/)
  })
})

describe('forgotPassword', () => {
  it('resolves on success', async () => {
    send.mockResolvedValueOnce({})

    await expect(forgotPassword('someone@example.com')).resolves.toBeUndefined()
  })

  it('resolves silently for an unregistered email (enumeration-safe)', async () => {
    send.mockRejectedValueOnce(cognitoError('UserNotFoundException'))

    await expect(forgotPassword('missing@example.com')).resolves.toBeUndefined()
  })

  it('throws a rate-limit error when Cognito throttles the request', async () => {
    send.mockRejectedValueOnce(cognitoError('LimitExceededException'))

    await expect(forgotPassword('someone@example.com')).rejects.toThrow(ForgotPasswordError)
  })

  // The exact bug fixed in this PR: a CONFIRMED-but-unverified-email account
  // (the state quick-signup used to leave users in) makes Cognito refuse to
  // send a reset code with this specific error.
  it('surfaces the "no verified delivery channel" error', async () => {
    send.mockRejectedValueOnce(
      cognitoError('InvalidParameterException', 'Cannot reset password for the user as there is no registered/verified email or phone_number')
    )

    await expect(forgotPassword('someone@example.com')).rejects.toThrow(/no registered\/verified email/)
  })
})
