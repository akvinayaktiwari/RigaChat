import { beforeEach, describe, expect, it, vi } from 'vitest'

const createContactMessage = vi.fn()
const markContactMessageNotified = vi.fn()
vi.mock('../repositories/contact-message-repository.js', () => ({
  createContactMessage,
  markContactMessageNotified,
}))

const sendEmail = vi.fn()
const getContactNotificationAddress = vi.fn()
vi.mock('../repositories/email-repository.js', () => ({
  sendEmail,
  getContactNotificationAddress,
}))

const tryAcquireContactAttempt = vi.fn()
vi.mock('../repositories/redis-repository.js', () => ({ tryAcquireContactAttempt }))

const { ContactError, submitContactMessage } = await import('./contact-service.js')

const VALID_INPUT = {
  name: 'Asha Rao',
  email: 'asha@example.com',
  subject: 'Demo request',
  message: 'We run three showrooms and want a bot on each site.',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  tryAcquireContactAttempt.mockResolvedValue(true)
  getContactNotificationAddress.mockReturnValue('support@vyostra.com')
  sendEmail.mockResolvedValue(undefined)
  markContactMessageNotified.mockResolvedValue(undefined)
  createContactMessage.mockImplementation(async (data: Record<string, unknown>) => ({
    ...data,
    messageId: 'msg-1',
    recordType: 'contact_message',
    createdAt: '2026-08-04T10:00:00.000Z',
  }))
})

describe('submitContactMessage — happy path', () => {
  it('stores the message, emails support with the sender as Reply-To, and flags it notified', async () => {
    const result = await submitContactMessage(VALID_INPUT, '203.0.113.9')

    expect(createContactMessage).toHaveBeenCalledWith({
      ...VALID_INPUT,
      sourceIp: '203.0.113.9',
      notified: false,
    })
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'support@vyostra.com', replyTo: 'asha@example.com' })
    )
    expect(markContactMessageNotified).toHaveBeenCalledWith('msg-1')
    expect(result).toEqual({ messageId: 'msg-1', createdAt: '2026-08-04T10:00:00.000Z' })
  })

  it('trims surrounding whitespace before storing', async () => {
    await submitContactMessage({ ...VALID_INPUT, name: '  Asha Rao  ' }, '203.0.113.9')

    expect(createContactMessage).toHaveBeenCalledWith(expect.objectContaining({ name: 'Asha Rao' }))
  })
})

describe('submitContactMessage — the message is never lost', () => {
  it('still succeeds when SES is not configured, leaving notified=false on the row', async () => {
    getContactNotificationAddress.mockReturnValue(null)

    const result = await submitContactMessage(VALID_INPUT, '203.0.113.9')

    expect(result.messageId).toBe('msg-1')
    expect(sendEmail).not.toHaveBeenCalled()
    expect(markContactMessageNotified).not.toHaveBeenCalled()
    expect(createContactMessage).toHaveBeenCalledWith(expect.objectContaining({ notified: false }))
  })

  it('still succeeds when the notification email throws', async () => {
    sendEmail.mockRejectedValue(new Error('SES throttled'))

    await expect(submitContactMessage(VALID_INPUT, '203.0.113.9')).resolves.toMatchObject({
      messageId: 'msg-1',
    })
    expect(markContactMessageNotified).not.toHaveBeenCalled()
  })

  it('still succeeds when flagging the row as notified fails after the email went out', async () => {
    markContactMessageNotified.mockRejectedValue(new Error('Dynamo throttled'))

    await expect(submitContactMessage(VALID_INPUT, '203.0.113.9')).resolves.toMatchObject({
      messageId: 'msg-1',
    })
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it('fails open and accepts the message when the rate limiter is down', async () => {
    tryAcquireContactAttempt.mockRejectedValue(new Error('Redis unreachable'))

    await expect(submitContactMessage(VALID_INPUT, '203.0.113.9')).resolves.toMatchObject({
      messageId: 'msg-1',
    })
    expect(createContactMessage).toHaveBeenCalledOnce()
  })
})

describe('submitContactMessage — rejections', () => {
  it.each([
    ['name', { name: '   ' }],
    ['email', { email: '' }],
    ['subject', { subject: '' }],
    ['message', { message: '' }],
  ])('rejects a blank %s without writing or emailing', async (_field, override) => {
    await expect(submitContactMessage({ ...VALID_INPUT, ...override }, '203.0.113.9')).rejects.toThrow(
      ContactError
    )
    expect(createContactMessage).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects a malformed email address', async () => {
    await expect(
      submitContactMessage({ ...VALID_INPUT, email: 'not-an-email' }, '203.0.113.9')
    ).rejects.toThrow('A valid email address is required')
    expect(createContactMessage).not.toHaveBeenCalled()
  })

  it('rejects an over-long message rather than truncating it', async () => {
    await expect(
      submitContactMessage({ ...VALID_INPUT, message: 'x'.repeat(5001) }, '203.0.113.9')
    ).rejects.toThrow('message must be 5000 characters or fewer')
    expect(createContactMessage).not.toHaveBeenCalled()
  })

  it('rate-limits a repeat submission with a 429-mapped code', async () => {
    tryAcquireContactAttempt.mockResolvedValue(false)

    await expect(submitContactMessage(VALID_INPUT, '203.0.113.9')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    })
    expect(createContactMessage).not.toHaveBeenCalled()
  })
})

describe('submitContactMessage — honeypot', () => {
  it('drops a submission with the honeypot filled, silently and before the rate limiter', async () => {
    const result = await submitContactMessage({ ...VALID_INPUT, company: 'Acme Corp' }, '203.0.113.9')

    expect(result.messageId).toBe('dropped')
    expect(tryAcquireContactAttempt).not.toHaveBeenCalled()
    expect(createContactMessage).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('accepts a submission where the honeypot is present but empty', async () => {
    await submitContactMessage({ ...VALID_INPUT, company: '' }, '203.0.113.9')

    expect(createContactMessage).toHaveBeenCalledOnce()
  })
})
