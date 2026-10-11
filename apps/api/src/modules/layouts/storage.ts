import { S3Client } from '@aws-sdk/client-s3'
import { parseApiEnvironment } from '@vstudio/config'

const env = parseApiEnvironment()
export const storageReady = Boolean(env.STORAGE_BUCKET)
export const storageBucket = env.STORAGE_BUCKET
export const s3 = new S3Client({ region: env.STORAGE_REGION, endpoint: env.STORAGE_ENDPOINT, forcePathStyle: Boolean(env.STORAGE_ENDPOINT), credentials: env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY ? { accessKeyId: env.STORAGE_ACCESS_KEY, secretAccessKey: env.STORAGE_SECRET_KEY } : undefined })
