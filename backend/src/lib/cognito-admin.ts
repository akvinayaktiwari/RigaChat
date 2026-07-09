import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'

const region = process.env.AWS_REGION

export const cognitoAdminClient = new CognitoIdentityProviderClient({ region })
