import { DecryptCommand, EncryptCommand, KMSClient } from '@aws-sdk/client-kms'

const region = process.env.AWS_REGION

const kmsClient = new KMSClient({ region })

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in your .env file before starting the server.`
    )
  }
  return value
}

export async function encrypt(plaintext: string): Promise<string> {
  const keyId = requireEnv('WHATSAPP_KMS_KEY_ID')

  const result = await kmsClient.send(
    new EncryptCommand({
      KeyId: keyId,
      Plaintext: Buffer.from(plaintext, 'utf-8'),
    })
  )

  if (!result.CiphertextBlob) {
    throw new Error('KMS encrypt returned no ciphertext')
  }

  return Buffer.from(result.CiphertextBlob).toString('base64')
}

export async function decrypt(ciphertext: string): Promise<string> {
  const keyId = requireEnv('WHATSAPP_KMS_KEY_ID')

  const result = await kmsClient.send(
    new DecryptCommand({
      KeyId: keyId,
      CiphertextBlob: Buffer.from(ciphertext, 'base64'),
    })
  )

  if (!result.Plaintext) {
    throw new Error('KMS decrypt returned no plaintext')
  }

  return Buffer.from(result.Plaintext).toString('utf-8')
}
