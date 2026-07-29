import { renderOtpEmail, type OtpEmailKind } from '../lib/email-templates/otp-email.js'

// Cognito invokes the User Pool's "Custom message" Lambda trigger right
// before sending ANY pool-generated email (or SMS) -- signup verification,
// resend, forgot-password, admin-created users, attribute-change
// verification, etc. -- passing the literal `{####}` code placeholder for us
// to build a message around; Cognito substitutes the real code afterward.
// This is the mechanism that lets us brand those emails without taking over
// OTP generation/expiry/verification ourselves, which Cognito already does
// securely. See docs: Amazon Cognito User Pools Lambda triggers -- Custom message.
export interface CognitoCustomMessageEvent {
  version: string
  triggerSource: string
  userPoolId: string
  userName: string
  request: {
    userAttributes: Record<string, string>
    codeParameter: string
    usernameParameter?: string
    clientMetadata?: Record<string, string>
  }
  response: {
    smsMessage: string
    emailMessage: string
    emailSubject: string
  }
}

const TRIGGER_SOURCE_TO_KIND: Record<string, OtpEmailKind | undefined> = {
  CustomMessage_SignUp: 'sign_up',
  CustomMessage_ResendCode: 'resend_code',
  CustomMessage_ForgotPassword: 'forgot_password',
}

// Trigger sources not in the map above (AdminCreateUser, UpdateUserAttribute,
// VerifyUserAttribute, Authentication) fall through untouched -- those flows
// aren't used by this app's signup/forgot-password paths, so there's no
// reviewed copy for them yet. Returning the event unchanged leaves Cognito's
// default message in place rather than guessing at content.
export function applyCustomMessage(event: CognitoCustomMessageEvent): CognitoCustomMessageEvent {
  const kind = TRIGGER_SOURCE_TO_KIND[event.triggerSource]
  if (!kind) {
    return event
  }

  // Username is the email for this pool (SignUpCommand uses Username: email
  // in auth-service.ts), but userAttributes.email is the more direct source
  // when present -- falling back to userName covers any trigger source where
  // Cognito omits it.
  const email = event.request.userAttributes.email ?? event.userName

  const { subject, html } = renderOtpEmail({ kind, email })
  event.response.emailSubject = subject
  event.response.emailMessage = html
  return event
}
