import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const region = process.env.AWS_REGION

const s3Client = new S3Client({ region })

const UPLOAD_URL_EXPIRY_SECONDS = 15 * 60

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in your .env file before starting the server.`
    )
  }
  return value
}

export async function generatePresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const bucket = requireEnv('S3_BUCKET_KB_FILES')

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  })

  return await getSignedUrl(s3Client, command, { expiresIn: UPLOAD_URL_EXPIRY_SECONDS })
}

export async function getObjectAsBuffer(key: string): Promise<Buffer> {
  const bucket = requireEnv('S3_BUCKET_KB_FILES')

  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))

  if (!response.Body) {
    throw new Error(`S3 object ${key} returned no body`)
  }

  // SdkStreamMixin's transformToByteArray() -- avoids manually draining a
  // Node Readable (and the `any`-typed casts that would otherwise require).
  const bytes = await response.Body.transformToByteArray()
  return Buffer.from(bytes)
}
