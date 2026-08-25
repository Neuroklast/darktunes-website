import type { S3Client } from '@aws-sdk/client-s3'
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getImportBatchById } from '@/lib/api/distributorImportBatches'
import { ApiError } from '@/lib/errors'
import { DEFAULT_ORGANIZATION_ID } from '@/lib/organizations/constants'
import { createR2Client } from '@/lib/r2Utils'
import type { Database } from '@/types/database'

export interface BronzeMultipartR2Context {
  s3: S3Client
  bucket: string
}

export interface BronzeMultipartPartRef {
  partNumber: number
  etag: string
}

export async function createBronzeMultipartR2Context(): Promise<BronzeMultipartR2Context> {
  const { serverEnv } = await import('@/lib/env.server')
  return {
    s3: createR2Client(
      serverEnv.CLOUDFLARE_R2_ACCOUNT_ID,
      serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
      serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    ),
    bucket: serverEnv.CLOUDFLARE_R2_BUCKET_NAME,
  }
}

export async function getWritableImportBatch(
  supabase: SupabaseClient<Database>,
  batchId: string,
  organizationId: string = DEFAULT_ORGANIZATION_ID,
) {
  const batch = await getImportBatchById(supabase, batchId, organizationId)
  if (!batch) throw new ApiError(404, 'Import batch not found')
  if (batch.fileHash || batch.status === 'completed') {
    throw new ApiError(409, 'Import batch already has archived content')
  }
  return batch
}

export async function initBronzeMultipartUpload(
  ctx: BronzeMultipartR2Context,
  r2Key: string,
  contentType: string,
): Promise<string> {
  const result = await ctx.s3.send(
    new CreateMultipartUploadCommand({
      Bucket: ctx.bucket,
      Key: r2Key,
      ContentType: contentType,
    }),
  )
  if (!result.UploadId) throw new ApiError(500, 'Failed to start multipart upload')
  return result.UploadId
}

export async function uploadBronzeMultipartPart(
  ctx: BronzeMultipartR2Context,
  r2Key: string,
  uploadId: string,
  partNumber: number,
  body: Buffer,
): Promise<string> {
  const result = await ctx.s3.send(
    new UploadPartCommand({
      Bucket: ctx.bucket,
      Key: r2Key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: body,
    }),
  )
  if (!result.ETag) throw new ApiError(500, 'Missing ETag from upload part')
  return result.ETag
}

export async function completeBronzeMultipartUpload(
  ctx: BronzeMultipartR2Context,
  r2Key: string,
  uploadId: string,
  parts: BronzeMultipartPartRef[],
): Promise<void> {
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber)
  await ctx.s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: ctx.bucket,
      Key: r2Key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sorted.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
        })),
      },
    }),
  )
}

export async function abortBronzeMultipartUpload(
  ctx: BronzeMultipartR2Context,
  r2Key: string,
  uploadId: string,
): Promise<void> {
  try {
    await ctx.s3.send(
      new AbortMultipartUploadCommand({
        Bucket: ctx.bucket,
        Key: r2Key,
        UploadId: uploadId,
      }),
    )
  } catch {
    // best effort
  }
}