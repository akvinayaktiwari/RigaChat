// Renders the branded HTML Cognito sends for signup verification, code
// resend, and forgot-password OTP emails (via the CustomMessage Lambda
// trigger -- see services/cognito-custom-message-service.ts). Reuses the same
// header/footer visual language as email-templates/base-shell.html, but as a
// TS template function rather than a static file: this needs to run inside
// the Lambda bundle with no filesystem template loading, and the OTP code
// itself is Cognito's literal `{####}` placeholder token, which Cognito
// substitutes with the real code after this returns -- never generate or
// fetch a code here.
//
// The code is wrapped in a link back to the app with `code={####}` (and
// `email=`) as query params, rather than a plain <span>: email clients strip
// <script>, so there is no way to run a real clipboard-copy from inside the
// message itself. Tapping through to a real webpage that copies the code and
// pre-fills the form is the only way to deliver a "tap it, don't retype it"
// experience -- see frontend's VerifyEmailPage.tsx / ResetPasswordPage.tsx,
// which read `?code=` on mount and copy it to the clipboard for exactly this
// link. The code text itself stays visible and selectable too, for anyone on
// a client that won't follow the link.
//
// No unsubscribe link: security/transactional mail, exempt from CAN-SPAM's
// opt-out requirement, and an "unsubscribe" link on a password-reset code
// would just confuse recipients.

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in your .env file before starting the server.`
    )
  }
  return value
}

const EMAIL_LOGO_URL = requireEnv('EMAIL_LOGO_URL')
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

// CAN-SPAM's physical-address requirement doesn't apply to pure transactional
// mail like this, but keeping the same footer identity as the marketing
// templates is good practice and costs nothing. Same city as
// email-templates/journeys-product-update.example.html's footer.
const COMPANY_ADDRESS = 'Bengaluru, Karnataka, India'

export type OtpEmailKind = 'sign_up' | 'resend_code' | 'forgot_password'

export interface RenderOtpEmailInput {
  kind: OtpEmailKind
  email: string
}

export interface RenderedOtpEmail {
  subject: string
  html: string
}

interface OtpCopy {
  subject: string
  previewText: string
  eyebrow: string
  headline: string
  intro: string
  disclaimer: string
  destinationPath: string
}

const COPY: Record<OtpEmailKind, OtpCopy> = {
  sign_up: {
    subject: 'Verify your email for VyostraAI',
    previewText: 'Your VyostraAI verification code is inside — it expires soon.',
    eyebrow: 'VERIFY YOUR EMAIL',
    headline: 'Confirm your email address',
    intro: 'Tap the code below to finish creating your VyostraAI account:',
    disclaimer: "Didn't try to sign up for VyostraAI? You can safely ignore this email.",
    destinationPath: '/verify-email',
  },
  resend_code: {
    subject: 'Your new VyostraAI verification code',
    previewText: 'Here is the new verification code you requested.',
    eyebrow: 'VERIFY YOUR EMAIL',
    headline: 'Here is your new code',
    intro: 'Tap the code below to finish creating your VyostraAI account:',
    disclaimer: "Didn't request this? You can safely ignore this email.",
    destinationPath: '/verify-email',
  },
  forgot_password: {
    subject: 'Reset your VyostraAI password',
    previewText: 'Use this code to reset your VyostraAI password.',
    eyebrow: 'PASSWORD RESET',
    headline: 'Reset your password',
    intro: 'Tap the code below to reset your VyostraAI password:',
    disclaimer: "Didn't request a password reset? You can safely ignore this email — your password will not change.",
    destinationPath: '/reset-password',
  },
}

export function renderOtpEmail({ kind, email }: RenderOtpEmailInput): RenderedOtpEmail {
  const copy = COPY[kind]
  // {####} is left unencoded and appended as-is: Cognito replaces this exact
  // literal substring with the real numeric code before the email is ever
  // sent, so by delivery time this is a plain, valid query param -- nothing
  // ever parses the `{`/`#`/`}` characters as URL syntax in between.
  const codeLink = `${FRONTEND_URL}${copy.destinationPath}?email=${encodeURIComponent(email)}&code={####}`

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${copy.subject}</title>
<!--[if mso]>
<noscript>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
</noscript>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f5f3fa;">
<div style="margin:0;padding:0;background-color:#f5f3fa;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f5f3fa;opacity:0;">
    ${copy.previewText}
  </div>

  <style>
    @media (prefers-color-scheme: dark) {
      .vy-canvas { background-color:#15121f !important; }
      .vy-card { background-color:#1f1a2e !important; border-color:#33294d !important; }
      .vy-heading { color:#f2effa !important; }
      .vy-body-text { color:#c9c2de !important; }
      .vy-muted { color:#8f87a8 !important; }
      .vy-code-box { background-color:#26203a !important; border-color:#43366b !important; }
      .vy-code-text { color:#d6b3ff !important; }
      .vy-footer-bg { background-color:#181327 !important; }
    }
    @media screen and (max-width:600px) {
      .vy-container { width:100% !important; }
      .vy-px { padding-left:20px !important; padding-right:20px !important; }
    }
  </style>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="vy-canvas" style="background-color:#f5f3fa;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="vy-container" style="width:600px;max-width:600px;">

          <tr>
            <td class="vy-card" style="background-color:#ffffff;border:1px solid #e8e4f3;border-radius:12px;overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:4px;line-height:4px;font-size:0;background-color:#7c3aed;background-image:linear-gradient(90deg,#7c3aed,#a855f7);">&nbsp;</td></tr>

                <tr>
                  <td class="vy-px" style="padding:32px 40px 24px 40px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" style="padding-right:10px;">
                          <img src="${EMAIL_LOGO_URL}" width="26" height="26" alt="" style="display:block;border:0;outline:none;height:26px;width:26px;" />
                        </td>
                        <td valign="middle">
                          <span class="vy-heading" style="font-family:'Plus Jakarta Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#1e1b2e;letter-spacing:-0.01em;">VyostraAI</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td class="vy-px" style="padding:0 40px;">
                    <span style="display:inline-block;font-family:'Plus Jakarta Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.2px;color:#7c3aed;text-transform:uppercase;">
                      ${copy.eyebrow}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td class="vy-px vy-heading" style="padding:10px 40px 4px 40px;font-family:'Plus Jakarta Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:24px;line-height:1.3;font-weight:700;color:#1e1b2e;">
                    ${copy.headline}
                  </td>
                </tr>

                <tr>
                  <td class="vy-px vy-body-text" style="padding:16px 40px 4px 40px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#4b4560;">
                    ${copy.intro}
                  </td>
                </tr>

                <tr>
                  <td class="vy-px" style="padding:20px 40px 8px 40px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" class="vy-code-box" style="background-color:#f0ecfa;border:1px solid #ddd3f7;border-radius:10px;padding:20px 24px;">
                          <a href="${codeLink}" style="display:block;text-decoration:none;">
                            <span class="vy-code-text" style="display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#7c3aed;">
                              {####}
                            </span>
                            <br />
                            <span style="display:inline-block;margin-top:8px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:#7c3aed;">
                              Tap to copy &amp; continue &rarr;
                            </span>
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td class="vy-px vy-muted" style="padding:16px 40px 32px 40px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#8b849f;">
                    This code will expire soon — if it has, just request a new one.
                    <br /><br />
                    ${copy.disclaimer}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr><td style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>

          <tr>
            <td class="vy-footer-bg" style="padding:0 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="vy-px vy-muted" style="padding:0 32px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.7;color:#8b849f;text-align:center;">
                    This is a security email related to your VyostraAI account.
                  </td>
                </tr>
                <tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>
                <tr>
                  <td class="vy-px vy-muted" style="padding:0 32px 24px 32px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;line-height:1.6;color:#8b849f;text-align:center;">
                    VyostraAI &middot; ${COMPANY_ADDRESS}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</div>
</body>
</html>`

  return { subject: copy.subject, html }
}
