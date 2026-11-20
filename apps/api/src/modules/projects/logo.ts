import { randomUUID } from 'node:crypto'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PROJECT_LOGO_CONTENT_TYPES, PROJECT_LOGO_MAX_BYTES } from '@vstudio/validation'
import type { FastifyBaseLogger, FastifyRequest } from 'fastify'
import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'
import type { z } from 'zod'
import { s3, storageBucket } from '../layouts/storage.js'

export async function readProjectInput<T>(request: FastifyRequest, schema: z.ZodType<T>): Promise<
  { details: T; logo?: Buffer } | { error: string; status: 400 | 413 }
> {
  let details: unknown = request.body
  let image: Buffer | undefined
  if (request.isMultipart()) {
    try {
      const parts = request.parts({ limits: { fields: 1, files: 1, fieldSize: 64 * 1024, fileSize: PROJECT_LOGO_MAX_BYTES + 1 } })
      for await (const part of parts) {
        if (part.type === 'file') {
          if (part.fieldname !== 'logo') {
            part.file.resume()
            return { error: 'Use the logo field for the project image.', status: 400 }
          }
          image = await part.toBuffer()
          if (image.length > PROJECT_LOGO_MAX_BYTES)
            return { error: 'Choose a project image that is 5 MB or smaller.', status: 413 }
        } else if (part.fieldname === 'details' && typeof part.value === 'string' && !part.valueTruncated) {
          details = JSON.parse(part.value)
        } else {
          return { error: 'Invalid project details.', status: 400 }
        }
      }
    } catch (error) {
      if (error instanceof SyntaxError)
        return { error: 'Invalid project details.', status: 400 }
      if (error instanceof Error && 'code' in error && error.code === 'FST_REQ_FILE_TOO_LARGE')
        return { error: 'Choose a project image that is 5 MB or smaller.', status: 413 }
      throw error
    }
  }

  const parsed = schema.safeParse(details)
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Invalid project details.', status: 400 }
  if (!image) return { details: parsed.data }

  try {
    const type = await fileTypeFromBuffer(image)
    if (type && PROJECT_LOGO_CONTENT_TYPES.some(mime => mime === type.mime)) {
      const logo = await sharp(image, { limitInputPixels: 25_000_000 })
        .rotate()
        .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer()
      return { details: parsed.data, logo }
    }
  } catch {
    // Unreadable and oversized images share the same validation result.
  }
  return { error: 'Choose a readable PNG, JPEG, or WebP image up to 25 megapixels.', status: 400 }
}

export async function storeProjectLogo(organizationId: string, projectId: string, logo: Buffer, log: FastifyBaseLogger) {
  if (!storageBucket) throw new Error('Project image storage is not configured.')
  const key = `${organizationId}/projects/${projectId}/logos/${randomUUID()}.webp`
  try {
    await s3.send(new PutObjectCommand({ Bucket: storageBucket, Key: key, Body: logo, ContentType: 'image/webp', CacheControl: 'private, max-age=3600' }))
    return key
  } catch (error) {
    await deleteProjectLogo(key, log)
    throw error
  }
}

export async function deleteProjectLogo(key: string | null | undefined, log: FastifyBaseLogger) {
  if (!key || !storageBucket) return
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: storageBucket, Key: key }))
  } catch (error) {
    log.warn({ err: error, key }, 'Could not remove a project image from storage')
  }
}

export async function projectLogoUrl(key: string | null, log: FastifyBaseLogger) {
  if (!key || !storageBucket) return undefined
  try {
    return await getSignedUrl(s3, new GetObjectCommand({ Bucket: storageBucket, Key: key }), { expiresIn: 3600 })
  } catch (error) {
    log.warn({ err: error, key }, 'Could not sign the project image URL')
    return undefined
  }
}

export async function withProjectLogo<T extends { logoAssetKey: string | null }>(project: T, log: FastifyBaseLogger) {
  const { logoAssetKey, ...details } = project
  return { ...details, logoUrl: await projectLogoUrl(logoAssetKey, log) }
}
