import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { parseApiEnvironment } from '@vstudio/config'
import { withTenant } from '@vstudio/database/tenant'
import { s3, storageBucket } from './storage.js'

const env = parseApiEnvironment()
const connection = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true }) : undefined
const queue = connection ? new Queue('asset-processing', { connection }) : undefined
let worker: Worker<AssetOptimizationJob> | undefined
export interface AssetOptimizationJob { organizationId: string; layoutId: string; assetKey: string }

export async function enqueueAssetOptimization(data: AssetOptimizationJob) {
  if (queue) return queue.add('optimize-layout', data, { attempts: 4, backoff: { type: 'exponential', delay: 1500 }, removeOnComplete: 500, removeOnFail: 2000 })
  return processAssetOptimization(data)
}

export async function processAssetOptimization(data: AssetOptimizationJob) {
  if (!storageBucket) throw new Error('Object storage is not configured.')
  const object = await s3.send(new GetObjectCommand({ Bucket: storageBucket, Key: data.assetKey }))
  if (!object.Body) throw new Error('Uploaded layout asset has no content.')
  const source = Buffer.from(await object.Body.transformToByteArray())
  const optimized = await sharp(source).rotate().resize({ width: 3200, height: 3200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer()
  const thumbnail = await sharp(source).rotate().resize({ width: 600, height: 420, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
  const optimizedKey = `${data.organizationId}/layouts/${data.layoutId}/optimized.webp`
  const thumbnailKey = `${data.organizationId}/layouts/${data.layoutId}/thumbnail.webp`
  await Promise.all([
    s3.send(new PutObjectCommand({ Bucket: storageBucket, Key: optimizedKey, Body: optimized, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' })),
    s3.send(new PutObjectCommand({ Bucket: storageBucket, Key: thumbnailKey, Body: thumbnail, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' })),
  ])
  await withTenant({ organizationId: data.organizationId }, tx => tx.layout.update({ where: { id: data.layoutId }, data: { optimizedAssetKey: optimizedKey, thumbnailAssetKey: thumbnailKey } }))
}

export async function startAssetWorker() {
  if (!connection || worker) return worker
  worker = new Worker<AssetOptimizationJob>('asset-processing', job => processAssetOptimization(job.data), { connection, concurrency: 4 })
  worker.on('failed', (job, error) => console.error(JSON.stringify({ level: 'error', queue: 'asset-processing', jobId: job?.id, error: error.message })))
  return worker
}

export async function closeAssetQueue() {
  await worker?.close()
  await queue?.close()
  await connection?.quit()
}
