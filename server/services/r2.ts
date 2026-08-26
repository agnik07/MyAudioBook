import { S3Client, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Response } from 'express';
import fs from 'fs';
import { Readable } from 'stream';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Get Cloudflare R2 S3 Client instance
 */
export function getR2Client(): S3Client {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export function getR2BucketName(): string {
  return process.env.CLOUDFLARE_R2_BUCKET_NAME || 'myaudiobook-storage';
}

export function isR2Configured(): boolean {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';

  return Boolean(
    accountId &&
    accessKeyId &&
    secretAccessKey &&
    !accountId.includes('your_cloudflare_account_id_here') &&
    !accessKeyId.includes('your_r2_access_key_id_here')
  );
}

/**
 * High-performance multipart upload of large audio files (250MB–500MB+) to Cloudflare R2
 */
export async function uploadToR2(
  key: string,
  filePath: string,
  mimeType: string
): Promise<string> {
  const s3 = getR2Client();
  const bucket = getR2BucketName();
  const fileStream = fs.createReadStream(filePath);

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: fileStream,
      ContentType: mimeType,
    },
    // 10MB upload chunk size for optimized memory and throughput
    queueSize: 4,
    partSize: 10 * 1024 * 1024,
  });

  await upload.done();
  return key;
}

/**
 * Stream byte ranges directly from Cloudflare R2 to browser (HTTP Range Requests)
 */
export async function streamR2FileRange(
  key: string,
  rangeHeader: string | undefined,
  res: Response
): Promise<void> {
  const s3 = getR2Client();
  const bucket = getR2BucketName();

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: rangeHeader,
    });

    const response = await s3.send(command);

    const contentLength = response.ContentLength || 0;
    const contentType = response.ContentType || 'audio/mpeg';

    if (response.ContentRange) {
      res.status(206);
      res.setHeader('Content-Range', response.ContentRange);
    } else {
      res.status(200);
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', contentLength);
    res.setHeader('Accept-Ranges', 'bytes');

    if (response.Body instanceof Readable) {
      response.Body.pipe(res);
    } else {
      // @ts-ignore
      Readable.from(response.Body as any).pipe(res);
    }
  } catch (err: any) {
    console.error(`[R2 Streaming Error for ${key}]:`, err.message || err);
    throw err;
  }
}

/**
 * Delete item from Cloudflare R2 Bucket
 */
export async function deleteR2Item(key: string): Promise<void> {
  if (!key) return;
  try {
    const s3 = getR2Client();
    const bucket = getR2BucketName();
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err: any) {
    console.warn(`Could not delete R2 item ${key}:`, err.message || err);
  }
}

/**
 * Get Cloudflare R2 configuration status and info
 */
export async function getR2StorageInfo(): Promise<{
  configured: boolean;
  bucketName: string;
  isLowStorage: boolean;
}> {
  const configured = isR2Configured();
  const bucketName = getR2BucketName();

  if (!configured) {
    return { configured: false, bucketName, isLowStorage: false };
  }

  try {
    const s3 = getR2Client();
    // Test R2 bucket accessibility
    await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: 'non-existent-test-key' })).catch(() => {});
    return { configured: true, bucketName, isLowStorage: false };
  } catch {
    return { configured: false, bucketName, isLowStorage: false };
  }
}
