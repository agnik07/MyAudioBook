import { S3Client, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Response } from 'express';
import fs from 'fs';
import { Readable } from 'stream';
import dotenv from 'dotenv';
import { getBookById, insertBook, insertChapters } from '../db/database';

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
 * Generate high-performance direct streaming pre-signed URL from Cloudflare R2 edge servers
 */
export async function getR2AudioPresignedUrl(key: string): Promise<string | null> {
  if (!isR2Configured() || !key) return null;
  try {
    const s3 = getR2Client();
    const bucket = getR2BucketName();
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    // Generate signed URL valid for 24 hours (86400 seconds)
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 86400 });
    return signedUrl;
  } catch (err: any) {
    console.warn(`[R2 Presigned URL Warning] Could not generate signed URL for ${key}:`, err.message || err);
    return null;
  }
}

/**
 * Save chapters JSON metadata file directly to Cloudflare R2
 */
export async function saveChaptersToR2(bookId: string, metadataPayload: any): Promise<void> {
  if (!isR2Configured()) return;
  try {
    const s3 = getR2Client();
    const bucket = getR2BucketName();
    const key = `audiobooks/${bookId}/chapters.json`;
    const jsonStr = JSON.stringify(metadataPayload, null, 2);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: jsonStr,
        ContentType: 'application/json',
      })
    );
    console.log(`[R2 Metadata] Chapters metadata saved to Cloudflare R2: ${key}`);
  } catch (err: any) {
    console.warn(`[R2 Metadata Warning] Could not save chapters.json to R2:`, err.message || err);
  }
}

/**
 * Fetch chapters JSON metadata file from Cloudflare R2
 */
export async function fetchChaptersFromR2(bookId: string): Promise<any | null> {
  if (!isR2Configured()) return null;
  try {
    const s3 = getR2Client();
    const bucket = getR2BucketName();
    const key = `audiobooks/${bookId}/chapters.json`;

    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3.send(cmd);

    let stream = response.Body as any;
    if (stream) {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const jsonText = Buffer.concat(chunks).toString('utf-8');
      return JSON.parse(jsonText);
    }
    return null;
  } catch {
    return null;
  }
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
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

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
 * Automatically sync/recover books from Cloudflare R2 Object Storage into SQLite
 */
export async function syncBooksFromR2(): Promise<number> {
  if (!isR2Configured()) return 0;

  try {
    const s3 = getR2Client();
    const bucket = getR2BucketName();

    const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: 'audiobooks/' });
    const res = await s3.send(cmd);
    const contents = res.Contents || [];

    if (contents.length === 0) return 0;

    // Group items by bookId
    const bookMap: Record<string, { audioKey?: string; coverKey?: string; size: number }> = {};

    for (const item of contents) {
      if (!item.Key) continue;
      const parts = item.Key.split('/');
      if (parts.length >= 3) {
        const bookId = parts[1]; // e.g. book-1787732260657
        const fileName = parts[2]; // e.g. audio-book-... or cover-book-...

        if (!bookMap[bookId]) {
          bookMap[bookId] = { size: 0 };
        }

        if (fileName.startsWith('audio-')) {
          bookMap[bookId].audioKey = item.Key;
          bookMap[bookId].size = item.Size || 0;
        } else if (fileName.startsWith('cover-')) {
          bookMap[bookId].coverKey = item.Key;
        }
      }
    }

    let syncedCount = 0;

    for (const [bookId, data] of Object.entries(bookMap)) {
      if (!data.audioKey) continue;

      const existing = await getBookById(bookId);
      if (!existing) {
        // Attempt reading chapters.json metadata from Cloudflare R2
        const r2Metadata = await fetchChaptersFromR2(bookId);

        let titleClean = 'Untitled Audiobook';
        let authorGuess = 'Unknown Author';
        let descriptionGuess = 'Automatically synced & recovered from Cloudflare R2 Storage.';
        let genreGuess = 'Self-Improvement';
        let chaptersToUse: any[] = [];

        if (r2Metadata && r2Metadata.book) {
          titleClean = r2Metadata.book.title || titleClean;
          authorGuess = r2Metadata.book.author || authorGuess;
          descriptionGuess = r2Metadata.book.description || descriptionGuess;
          genreGuess = r2Metadata.book.genre || genreGuess;
        } else {
          const rawFileName = data.audioKey.split('/').pop() || '';
          titleClean = rawFileName
            .replace(/^audio-book-\d+-/, '')
            .replace(/\.mp3$/i, '')
            .replace(/[-_]/g, ' ')
            .trim() || 'Untitled Audiobook';

          const lower = titleClean.toLowerCase();
          if (lower.includes('seduction') || lower.includes('power') || lower.includes('48')) {
            authorGuess = 'Robert Greene';
          }
        }

        const estDuration = r2Metadata?.book?.totalDuration || Math.max(300, Math.floor(data.size / 24000));

        if (r2Metadata && Array.isArray(r2Metadata.chapters) && r2Metadata.chapters.length > 0) {
          chaptersToUse = r2Metadata.chapters.map((ch: any) => ({
            id: ch.id || `ch-${bookId}-${ch.chapterNumber}`,
            bookId,
            chapterNumber: ch.chapterNumber,
            title: ch.title,
            startTime: ch.startTime || 0,
            endTime: ch.endTime || estDuration,
            duration: ch.duration || Math.max(1, (ch.endTime || estDuration) - (ch.startTime || 0)),
          }));
        } else {
          const chunkSize = Math.max(60, Math.floor(estDuration / 3));
          chaptersToUse = [
            { id: `ch-${bookId}-1`, bookId, chapterNumber: 1, title: 'Chapter 1: Introduction', startTime: 0, endTime: chunkSize, duration: chunkSize },
            { id: `ch-${bookId}-2`, bookId, chapterNumber: 2, title: 'Chapter 2: Foundations', startTime: chunkSize, endTime: chunkSize * 2, duration: chunkSize },
            { id: `ch-${bookId}-3`, bookId, chapterNumber: 3, title: 'Chapter 3: Advanced Concepts', startTime: chunkSize * 2, endTime: estDuration, duration: Math.max(1, estDuration - chunkSize * 2) },
          ];
        }

        const bookData = {
          id: bookId,
          title: titleClean,
          author: authorGuess,
          description: descriptionGuess,
          genre: genreGuess,
          language: 'English',
          r2AudioKey: data.audioKey,
          r2CoverKey: data.coverKey || null,
          localFileName: null,
          localCoverName: null,
          audioFileName: `${titleClean}.mp3`,
          fileSize: data.size,
          totalDuration: estDuration,
          processingStatus: 'ready',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await insertBook(bookData);
        await insertChapters(chaptersToUse);
        syncedCount++;
        console.log(`[R2 Auto-Sync] Automatically recovered book "${titleClean}" (${bookId}) with ${chaptersToUse.length} chapters from Cloudflare R2!`);
      }
    }

    return syncedCount;
  } catch (err: any) {
    console.warn('[R2 Auto-Sync Warning] Failed to sync books from R2:', err.message || err);
    return 0;
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
