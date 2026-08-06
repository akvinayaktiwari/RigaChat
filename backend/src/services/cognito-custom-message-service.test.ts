import { describe, expect, it } from 'vitest'
import { applyCustomMessage, type CognitoCustomMessageEvent } from './cognito-custom-message-service.js'

function baseEvent(triggerSource: string): CognitoCustomMessageEvent {
  return {
    version: '1',
    triggerSource,
    userPoolId: 'test-pool-id',
    userName: 'someone@example.com',
    request: { userAttributes: { email: 'someone@example.com' }, codeParameter: '{####}' },
    response: { smsMessage: '', emailMessage: '', emailSubject: '' },
  }
}

describe('applyCustomMessage', () => {
  it.each([
    ['CustomMessage_SignUp', /verify/i],
    ['CustomMessage_ResendCode', /new.*code/i],
    ['CustomMessage_ForgotPassword', /reset/i],
  ])('brands the %s email', (triggerSource, subjectPattern) => {
    const result = applyCustomMessage(baseEvent(triggerSource))

    expect(result.response.emailSubject).toMatch(subjectPattern)
    expect(result.response.emailMessage).toContain('{####}')
    expect(result.response.emailMessage).toContain(encodeURIComponent('someone@example.com'))
  })

  it('falls back to userName when userAttributes.email is missing', () => {
    const event = baseEvent('CustomMessage_SignUp')
    event.request.userAttributes = {}

    const result = applyCustomMessage(event)

    expect(result.response.emailMessage).toContain(encodeURIComponent('someone@example.com'))
  })

  it('leaves unmapped trigger sources untouched, falling back to Cognito default', () => {
    const event = baseEvent('CustomMessage_AdminCreateUser')

    const result = applyCustomMessage(event)

    expect(result.response.emailSubject).toBe('')
    expect(result.response.emailMessage).toBe('')
  })
})
