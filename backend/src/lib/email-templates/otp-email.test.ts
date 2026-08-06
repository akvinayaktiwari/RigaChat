import { describe, expect, it } from 'vitest'
import { renderOtpEmail } from './otp-email.js'

const EMAIL = 'someone@example.com'

describe('renderOtpEmail', () => {
  it('embeds the literal Cognito code placeholder in both the visible text and the link, not a generated code', () => {
    const { html } = renderOtpEmail({ kind: 'sign_up', email: EMAIL })
    expect(html).toContain('{####}')
    expect(html).toContain('code={####}')
  })

  it('links back to the app with the recipient email and code as query params', () => {
    const { html } = renderOtpEmail({ kind: 'forgot_password', email: EMAIL })
    expect(html).toContain(`email=${encodeURIComponent(EMAIL)}`)
    expect(html).toContain('/reset-password?')
  })

  it('routes signup and resend to the verify-email page, forgot-password to reset-password', () => {
    expect(renderOtpEmail({ kind: 'sign_up', email: EMAIL }).html).toContain('/verify-email?')
    expect(renderOtpEmail({ kind: 'resend_code', email: EMAIL }).html).toContain('/verify-email?')
    expect(renderOtpEmail({ kind: 'forgot_password', email: EMAIL }).html).toContain('/reset-password?')
  })

  it('carries distinct, correct copy per kind', () => {
    expect(renderOtpEmail({ kind: 'sign_up', email: EMAIL }).subject).toMatch(/verify/i)
    expect(renderOtpEmail({ kind: 'resend_code', email: EMAIL }).subject).toMatch(/new.*code/i)
    expect(renderOtpEmail({ kind: 'forgot_password', email: EMAIL }).subject).toMatch(/reset/i)
  })

  it('never includes an unsubscribe link -- this is transactional/security mail', () => {
    for (const kind of ['sign_up', 'resend_code', 'forgot_password'] as const) {
      expect(renderOtpEmail({ kind, email: EMAIL }).html.toLowerCase()).not.toContain('unsubscribe')
    }
  })

  it('includes a disclaimer telling the recipient it is safe to ignore if unexpected', () => {
    const { html } = renderOtpEmail({ kind: 'forgot_password', email: EMAIL })
    expect(html.toLowerCase()).toContain('safely ignore')
  })

  it('does not leave the TODO placeholder address in the footer', () => {
    const { html } = renderOtpEmail({ kind: 'sign_up', email: EMAIL })
    expect(html).not.toContain('TODO')
    expect(html).toContain('Bengaluru')
  })
})
