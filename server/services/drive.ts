import { google } from 'googleapis';
import { Response } from 'express';
import fs from 'fs';
import { Readable } from 'stream';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Get an OAuth2Client instance configured with environment variables
 */
export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || '';

  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  if (refreshToken && !refreshToken.includes('your_google_oauth_refresh_token_here')) {
    client.setCredentials({ refresh_token: refreshToken });
  }

  return client;
}

/**
 * Get Google Drive v3 client using current OAuth2Client credentials
 */
export function getDriveClient() {
  return google.drive({ version: 'v3', auth: getOAuth2Client() });
}

export function isGoogleDriveConfigured(): boolean {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || '';

  return Boolean(
    clientId &&
    clientSecret &&
    refreshToken &&
    !refreshToken.includes('your_google_oauth_refresh_token_here')
  );
}

/**
 * Get or create the root 'Audiobooks' folder in Google Drive
 */
export async function getOrCreateAudiobooksFolder(): Promise<string> {
  const drive = getDriveClient();

  // Check if Audiobooks folder already exists
  const res = await drive.files.list({
    q: "name = 'Audiobooks' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  // Create root folder
  const folder = await drive.files.create({
    requestBody: {
      name: 'Audiobooks',
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  return folder.data.id!;
}

/**
 * Create a subfolder for a specific book inside Audiobooks root folder
 */
export async function createBookFolder(bookTitle: string): Promise<string> {
  const drive = getDriveClient();
  const rootFolderId = await getOrCreateAudiobooksFolder();

  // Create book directory folder
  const folder = await drive.files.create({
    requestBody: {
      name: bookTitle.replace(/[/\\?%*:|"<>]/g, '_'),
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    },
    fields: 'id',
  });

  return folder.data.id!;
}

/**
 * Resumable upload of large files (MP3 audiobooks up to 500MB+) to Google Drive
 */
export async function uploadResumableToDrive(
  folderId: string,
  fileName: string,
  mimeType: string,
  filePath: string
): Promise<string> {
  const drive = getDriveClient();
  const fileStream = fs.createReadStream(filePath);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: fileStream,
    },
    fields: 'id, name, size',
  });

  return res.data.id!;
}

/**
 * Stream byte ranges directly from Google Drive to browser player (HTTP Range Requests)
 */
export async function streamDriveFileRange(
  fileId: string,
  rangeHeader: string | undefined,
  res: Response
) {
  const drive = getDriveClient();

  try {
    // 1. Fetch file metadata (size, mimeType)
    const fileMeta = await drive.files.get({
      fileId,
      fields: 'id, size, mimeType',
    });

    const fileSize = parseInt(fileMeta.data.size || '0', 10);
    const mimeType = fileMeta.data.mimeType || 'audio/mpeg';

    if (!rangeHeader) {
      // Return full stream if no range requested
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Accept-Ranges', 'bytes');

      const streamRes = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      (streamRes.data as Readable).pipe(res);
      return;
    }

    // 2. Parse range header (e.g. "bytes=0-1048575")
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    const chunkSize = end - start + 1;

    res.status(206); // Partial Content
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', chunkSize);
    res.setHeader('Content-Type', mimeType);

    // 3. Request range from Google Drive API
    const driveStreamRes = await drive.files.get(
      { fileId, alt: 'media' },
      {
        headers: { Range: `bytes=${start}-${end}` },
        responseType: 'stream',
      }
    );

    (driveStreamRes.data as Readable).pipe(res);
  } catch (err: any) {
    console.error('Google Drive Range Stream Error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream audio range from Google Drive' });
    }
  }
}

/**
 * Delete file or folder from Google Drive
 */
export async function deleteDriveItem(fileOrFolderId: string) {
  try {
    const drive = getDriveClient();
    await drive.files.delete({ fileId: fileOrFolderId });
  } catch (err) {
    console.warn(`Could not delete Drive item ${fileOrFolderId}:`, err);
  }
}

/**
 * Get Google Drive storage quota info (Section 36 Requirement)
 */
export async function getDriveStorageInfo() {
  if (!isGoogleDriveConfigured()) {
    return { configured: false, usedBytes: 0, totalBytes: 0, limitBytes: 0 };
  }

  const drive = getDriveClient();
  const about = await drive.about.get({ fields: 'storageQuota' });
  const quota = about.data.storageQuota || {};

  const limitBytes = parseInt(quota.limit || '0', 10);
  const usageBytes = parseInt(quota.usage || '0', 10);
  const usageInDriveBytes = parseInt(quota.usageInDrive || '0', 10);

  return {
    configured: true,
    usedBytes: usageBytes,
    usedInDriveBytes: usageInDriveBytes,
    limitBytes,
    availableBytes: Math.max(0, limitBytes - usageBytes),
    isLowStorage: limitBytes > 0 && usageBytes / limitBytes > 0.85,
  };
}
