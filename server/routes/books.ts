import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import {
  getAllBooks,
  getBookById,
  insertBook,
  deleteBookRecord,
  getChaptersForBook,
  insertChapters,
  upsertListeningProgress,
  toggleFavoriteRecord,
  exportDatabaseJSON,
} from '../db/database';
import {
  uploadToR2,
  deleteR2Item,
  getR2StorageInfo,
  isR2Configured,
  getR2Client,
  getR2BucketName,
  syncBooksFromR2,
  saveChaptersToR2,
  getR2AudioPresignedUrl,
  getR2CoverPresignedUrl,
  saveUserProgressToR2,
} from '../services/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getAudioMetadata } from '../services/ffmpeg';
import {
  transcribeAudioWithGroq,
  detectChaptersWithGroq,
  parseChaptersFromDescriptionWithGroq,
} from '../services/groq';

function parseTimestampToSeconds(timestamp: string): number {
  if (!timestamp) return 0;
  const parts = String(timestamp).trim().split(':').map((p) => parseInt(p, 10) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

const router = Router();

// Setup temp and uploads directories
const tempDir = path.join(process.cwd(), 'temp');
const uploadsDir = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tempDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
  }),
  limits: { fileSize: 1000 * 1024 * 1024 }, // 1GB limit
});

// 1. GET /api/books (Search, Filter, Sort + Cloudflare R2 Auto-Sync)
router.get('/books', async (req: Request, res: Response) => {
  try {
    const { search, genre, filterBy, sortBy } = req.query;
    let books = await getAllBooks(
      search as string,
      genre as string,
      filterBy as string,
      sortBy as string
    );

    if (books.length === 0) {
      // If DB is empty, run blocking R2 recovery
      await syncBooksFromR2().catch(() => {});
      books = await getAllBooks(
        search as string,
        genre as string,
        filterBy as string,
        sortBy as string
      );
    } else {
      // Background non-blocking R2 sync
      syncBooksFromR2().catch(() => {});
    }

    res.json({ books });
  } catch (err: any) {
    console.error('Error fetching books:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch books' });
  }
});

// 2. GET /api/books/:id
router.get('/books/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const book = await getBookById(id);
    if (!book) return res.status(404).json({ error: 'Book not found' });

    const chapters = await getChaptersForBook(id);
    res.json({ book, chapters });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch book' });
  }
});

// 3. POST /api/books/upload (Cloudflare R2 Upload + Groq AI Description Parsing / Audio Transcription)
router.post(
  '/books/upload',
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const audioFile = files?.audio?.[0];
      const coverFile = files?.cover?.[0];

      if (!audioFile) {
        return res.status(400).json({ error: 'No audio file uploaded.' });
      }

      const {
        title = 'Untitled Audiobook',
        author = 'Unknown Author',
        genre = 'Audiobook',
        description = '',
        language = 'English',
        detectionMode = 'ai',
        manualTimestamps = '[]',
        timestampDescription = '',
      } = req.body;

      console.log(`[Upload] Processing "${title}" by ${author}...`);

      const bookId = `book-${Date.now()}`;
      const uniqueAudioName = `${bookId}-${audioFile.originalname.replace(/\s+/g, '_')}`;
      const permanentLocalAudioPath = path.join(uploadsDir, uniqueAudioName);

      // Save a permanent copy in uploads/ directory for local fallback playback
      fs.copyFileSync(audioFile.path, permanentLocalAudioPath);

      // Extract metadata using FFmpeg ffprobe
      const metadata = await getAudioMetadata(permanentLocalAudioPath);
      const totalDuration = metadata.duration;

      let r2AudioKey: string | null = null;
      let r2CoverKey: string | null = null;
      let localCoverName: string | null = null;

      // Handle cover file if uploaded
      if (coverFile) {
        localCoverName = `${bookId}-cover-${coverFile.originalname.replace(/\s+/g, '_')}`;
        const permanentCoverPath = path.join(uploadsDir, localCoverName);
        fs.copyFileSync(coverFile.path, permanentCoverPath);
      }

      // 1. Upload to Cloudflare R2 Bucket if configured
      if (isR2Configured()) {
        try {
          console.log(`[R2 Storage] Uploading audio to Cloudflare R2 bucket...`);
          r2AudioKey = `audiobooks/${bookId}/audio-${uniqueAudioName}`;
          await uploadToR2(r2AudioKey, permanentLocalAudioPath, 'audio/mpeg');
          console.log(`[R2 Storage] Audio successfully uploaded to R2: ${r2AudioKey}`);

          if (coverFile && localCoverName) {
            const permanentCoverPath = path.join(uploadsDir, localCoverName);
            r2CoverKey = `audiobooks/${bookId}/cover-${localCoverName}`;
            await uploadToR2(r2CoverKey, permanentCoverPath, coverFile.mimetype || 'image/jpeg');
            console.log(`[R2 Storage] Cover image uploaded to R2: ${r2CoverKey}`);
          }
        } catch (r2Err: any) {
          console.warn('[R2 Storage Warning] Failed to upload to R2, relying on local fallback:', r2Err.message || r2Err);
        }
      }

      // 2. Chapter Detection Logic
      let detectedChapters: Array<{
        chapter_number: number;
        title: string;
        start_time: number;
        end_time: number;
      }> = [];

      if (detectionMode === 'description' || timestampDescription.trim().length > 0) {
        // Parse single timestamp description with Groq AI LLM & regex fallback
        console.log('[Groq AI] Parsing chapter timestamps from user description text...');
        detectedChapters = await parseChaptersFromDescriptionWithGroq(
          timestampDescription,
          totalDuration
        );
      } else if (detectionMode === 'manual') {
        try {
          const parsed = JSON.parse(manualTimestamps);
          if (Array.isArray(parsed) && parsed.length > 0) {
            detectedChapters = parsed.map((ts: any, idx: number) => {
              const startSec = ts.startTimeSeconds || parseTimestampToSeconds(ts.startTime);
              const nextTs = parsed[idx + 1];
              const endSec = nextTs ? (nextTs.startTimeSeconds || parseTimestampToSeconds(nextTs.startTime)) : totalDuration;
              return {
                chapter_number: idx + 1,
                title: ts.title || `Chapter ${idx + 1}`,
                start_time: startSec,
                end_time: endSec,
              };
            });
          }
        } catch (e) {
          console.warn('[Manual Chapters Warning] Could not parse manual timestamps:', e);
        }
      } else {
        // AI Chapter Detection via Groq Whisper Transcription
        if (process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.includes('your_groq_api_key')) {
          try {
            console.log('[Groq AI] Transcribing audio with Groq Whisper model...');
            const transcription = await transcribeAudioWithGroq(permanentLocalAudioPath);
            const segments = transcription.segments || [];

            console.log('[Groq AI] Detecting chapter boundaries with Llama model...');
            detectedChapters = await detectChaptersWithGroq(
              transcription.text || '',
              segments,
              totalDuration
            );
          } catch (groqErr: any) {
            console.warn('[Groq AI Warning] AI chapter detection failed, falling back to interval chunks:', groqErr.message || groqErr);
          }
        }
      }

      // Fallback 3 equal interval chunks if detected chapters are empty
      if (detectedChapters.length === 0) {
        const chunkSize = Math.max(60, totalDuration / 3);
        for (let i = 0; i < 3; i++) {
          const start = Math.floor(i * chunkSize);
          const end = i === 2 ? Math.floor(totalDuration) : Math.floor((i + 1) * chunkSize);
          detectedChapters.push({
            chapter_number: i + 1,
            title: `Chapter ${i + 1}`,
            start_time: start,
            end_time: end,
          });
        }
      }

      // Format chapter objects for database insertion
      const formattedChapters = detectedChapters.map((ch) => {
        const duration = Math.max(1, ch.end_time - ch.start_time);
        return {
          id: `ch-${bookId}-${ch.chapter_number}`,
          bookId,
          chapterNumber: ch.chapter_number,
          title: ch.title,
          startTime: ch.start_time,
          endTime: ch.end_time,
          duration,
        };
      });

      // Save book record & chapters into SQLite database
      const bookData = {
        id: bookId,
        title,
        author,
        description,
        genre,
        language,
        r2AudioKey,
        r2CoverKey,
        localFileName: uniqueAudioName,
        localCoverName,
        audioFileName: audioFile.originalname,
        fileSize: audioFile.size,
        totalDuration,
        processingStatus: 'ready',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await insertBook(bookData);
      await insertChapters(formattedChapters);

      // Save chapters.json metadata permanently to Cloudflare R2 bucket
      await saveChaptersToR2(bookId, { book: bookData, chapters: formattedChapters });

      // Clean up temporary upload files
      try {
        if (fs.existsSync(audioFile.path)) fs.unlinkSync(audioFile.path);
        if (coverFile && fs.existsSync(coverFile.path)) fs.unlinkSync(coverFile.path);
      } catch (e) {}

      const createdBook = await getBookById(bookId);
      const createdChapters = await getChaptersForBook(bookId);

      console.log(`[Upload Success] "${title}" stored cleanly in database & Cloudflare R2/Local!`);
      res.json({
        success: true,
        book: createdBook,
        chapters: createdChapters,
      });
    } catch (err: any) {
      console.error('[Upload Error]:', err);
      res.status(500).json({ error: err.message || 'Failed to upload and process audiobook.' });
    }
  }
);

// 4. PUT /api/books/:id/chapters (Update or Re-parse Chapters with Groq AI Description)
router.put('/books/:id/chapters', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const book = await getBookById(id);
    if (!book) return res.status(404).json({ error: 'Audiobook not found' });

    const { timestampDescription, manualTimestamps } = req.body;

    let detectedChapters: Array<{
      chapter_number: number;
      title: string;
      start_time: number;
      end_time: number;
    }> = [];

    if (timestampDescription && timestampDescription.trim().length > 0) {
      console.log(`[Groq AI Re-Parse] Parsing timestamp description for "${book.title}"...`);
      detectedChapters = await parseChaptersFromDescriptionWithGroq(
        timestampDescription,
        book.totalDuration
      );
    } else if (manualTimestamps && Array.isArray(manualTimestamps)) {
      detectedChapters = manualTimestamps.map((ts: any, idx: number) => {
        const startSec = ts.startTimeSeconds || parseTimestampToSeconds(ts.startTime);
        const nextTs = manualTimestamps[idx + 1];
        const endSec = nextTs ? (nextTs.startTimeSeconds || parseTimestampToSeconds(nextTs.startTime)) : book.totalDuration;
        return {
          chapter_number: idx + 1,
          title: ts.title || `Chapter ${idx + 1}`,
          start_time: startSec,
          end_time: endSec,
        };
      });
    }

    if (detectedChapters.length === 0) {
      return res.status(400).json({ error: 'No valid chapter timestamps found in input.' });
    }

    const formattedChapters = detectedChapters.map((ch) => ({
      id: `ch-${id}-${ch.chapter_number}`,
      bookId: id,
      chapterNumber: ch.chapter_number,
      title: ch.title,
      startTime: ch.start_time,
      endTime: ch.end_time,
      duration: Math.max(1, ch.end_time - ch.start_time),
    }));

    // Delete old chapters & insert new chapters into SQLite
    const { getDb } = await import('../db/database');
    const database = await getDb();
    database.exec(`DELETE FROM chapters WHERE book_id = '${id}'`);

    await insertChapters(formattedChapters);

    // Save updated chapters.json to Cloudflare R2
    await saveChaptersToR2(id, { book, chapters: formattedChapters });

    const updatedChapters = await getChaptersForBook(id);
    res.json({ success: true, chapters: updatedChapters });
  } catch (err: any) {
    console.error('Error updating chapters:', err);
    res.status(500).json({ error: err.message || 'Failed to update chapters' });
  }
});

// 5. GET /api/books/:id/audio-url (Control Plane: Generate Direct Cloudflare R2 Audio Presigned URL)
router.get('/books/:id/audio-url', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const book = await getBookById(id);
    if (!book) return res.status(404).json({ error: 'Audiobook not found' });

    if (book.r2AudioKey && isR2Configured()) {
      const presigned = await getR2AudioPresignedUrl(book.r2AudioKey, 3600);
      if (presigned) {
        console.log(`[Control Plane] Generated Cloudflare R2 signed audio URL for book: ${id}`);
        return res.json({
          bookId: id,
          url: presigned.url,
          expiresAt: presigned.expiresAt,
          expiresInSeconds: presigned.expiresInSeconds,
          isLocalFallback: false,
        });
      }
    }

    // Local file fallback URL for offline local development without R2 credentials
    res.json({
      bookId: id,
      url: `/api/books/${id}/audio-fallback`,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      expiresInSeconds: 3600,
      isLocalFallback: true,
    });
  } catch (err: any) {
    console.error('Error generating audio presigned URL:', err);
    res.status(500).json({ error: 'Failed to generate audio playback URL' });
  }
});

// 6. GET /api/books/:id/cover-url (Control Plane: Generate Direct Cloudflare R2 Cover Presigned URL)
router.get('/books/:id/cover-url', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const book = await getBookById(id);
    if (!book) {
      return res.json({
        bookId: id,
        url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
      });
    }

    if (book.r2CoverKey && isR2Configured()) {
      const presignedUrl = await getR2CoverPresignedUrl(book.r2CoverKey, 86400);
      if (presignedUrl) {
        return res.json({ bookId: id, url: presignedUrl });
      }
    }

    res.json({
      bookId: id,
      url: book.coverUrl || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate cover URL' });
  }
});

// 7. GET /api/books/:id/audio (Backwards compatibility redirect to R2 presigned URL / local fallback)
router.get('/books/:id/audio', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const book = await getBookById(id);
    if (!book) return res.status(404).json({ error: 'Audiobook not found' });

    if (book.r2AudioKey && isR2Configured()) {
      const presigned = await getR2AudioPresignedUrl(book.r2AudioKey, 3600);
      if (presigned?.url) {
        // Direct 302 Redirect so Render never proxies MP3 bytes
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.redirect(302, presigned.url);
      }
    }

    // Local fallback streaming for local dev
    const possiblePaths = [
      book.localFileName ? path.join(uploadsDir, book.localFileName) : null,
      book.audioFileName ? path.join(uploadsDir, book.audioFileName) : null,
      book.audioFileName ? path.join(tempDir, book.audioFileName) : null,
    ].filter(Boolean) as string[];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return streamLocalFileRange(p, req.headers.range as string | undefined, res);
      }
    }

    res.redirect('https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3');
  } catch (err: any) {
    console.error('Audio Stream Redirect Error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to obtain audio stream' });
    }
  }
});

// GET /api/books/:id/audio-fallback (Local development byte-range streaming fallback)
router.get('/books/:id/audio-fallback', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const book = await getBookById(id);
    if (!book) return res.status(404).json({ error: 'Audiobook not found' });

    const possiblePaths = [
      book.localFileName ? path.join(uploadsDir, book.localFileName) : null,
      book.audioFileName ? path.join(uploadsDir, book.audioFileName) : null,
      book.audioFileName ? path.join(tempDir, book.audioFileName) : null,
    ].filter(Boolean) as string[];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return streamLocalFileRange(p, req.headers.range as string | undefined, res);
      }
    }

    res.redirect('https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3');
  } catch (err: any) {
    res.status(500).json({ error: 'Local audio fallback failed' });
  }
});

function streamLocalFileRange(filePath: string, rangeHeader: string | undefined, res: Response) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const mimeType = 'audio/mpeg';

  if (!rangeHeader) {
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const parts = rangeHeader.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
  const chunkSize = end - start + 1;

  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', chunkSize);
  res.setHeader('Content-Type', mimeType);

  fs.createReadStream(filePath, { start, end }).pipe(res);
}

// 8. GET /api/books/:id/cover (Cover image 302 redirect to Cloudflare R2 / local fallback)
router.get('/books/:id/cover', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const book = await getBookById(id);
    if (!book) {
      return res.redirect('https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80');
    }

    if (book.r2CoverKey && isR2Configured()) {
      const presignedUrl = await getR2CoverPresignedUrl(book.r2CoverKey, 86400);
      if (presignedUrl) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.redirect(302, presignedUrl);
      }
    }

    if (book.localCoverName) {
      const p = path.join(uploadsDir, book.localCoverName);
      if (fs.existsSync(p)) {
        return res.sendFile(p);
      }
    }

    const possibleCovers = fs.readdirSync(uploadsDir).filter((f) => f.startsWith(`${id}-cover-`));
    if (possibleCovers.length > 0) {
      return res.sendFile(path.join(uploadsDir, possibleCovers[0]));
    }

    res.redirect('https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80');
  } catch (err: any) {
    res.redirect('https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80');
  }
});

// 7. PUT /api/books/:id/progress
router.get('/books/:id/progress', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const book = await getBookById(id);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    res.json({
      bookId: book.id,
      chapterId: book.currentChapterId,
      positionSeconds: book.lastPositionSeconds || 0,
      completed: book.completed || false,
      updatedAt: book.lastPlayedAt || new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

router.put('/books/:id/progress', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { chapterId, positionSeconds, completed } = req.body;
    await upsertListeningProgress(id, chapterId, positionSeconds, completed);

    // Save updated user progress map to Cloudflare R2 user_progress.json
    saveUserProgressToR2Map();

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

async function saveUserProgressToR2Map() {
  try {
    const all = await getAllBooks();
    const map: Record<string, any> = {};
    for (const b of all) {
      if ((b.lastPositionSeconds || 0) > 0) {
        map[b.id] = {
          bookId: b.id,
          chapterId: b.currentChapterId,
          positionSeconds: b.lastPositionSeconds,
          completed: b.completed,
          updatedAt: (b as any).lastPlayedAt || new Date().toISOString(),
        };
      }
    }
    await saveUserProgressToR2(map);
  } catch (e) {}
}

// 8. POST /api/books/:id/favorite
router.post('/books/:id/favorite', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const isFavorite = await toggleFavoriteRecord(id);
    res.json({ success: true, isFavorite });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// 9. DELETE /api/books/:id
router.delete('/books/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const book = await getBookById(id);
    if (book) {
      if (book.r2AudioKey) await deleteR2Item(book.r2AudioKey);
      if (book.r2CoverKey) await deleteR2Item(book.r2CoverKey);
      await deleteR2Item(`audiobooks/${id}/chapters.json`);

      if (book.localFileName) {
        const localPath = path.join(uploadsDir, book.localFileName);
        if (fs.existsSync(localPath)) {
          try { fs.unlinkSync(localPath); } catch {}
        }
      }

      if (book.localCoverName) {
        const localCoverPath = path.join(uploadsDir, book.localCoverName);
        if (fs.existsSync(localCoverPath)) {
          try { fs.unlinkSync(localCoverPath); } catch {}
        }
      }

      await deleteBookRecord(id);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete audiobook' });
  }
});

// 10. GET /api/settings/r2-storage
router.get('/settings/r2-storage', async (_req: Request, res: Response) => {
  try {
    const info = await getR2StorageInfo();
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to check storage info' });
  }
});

// 11. GET /api/settings/backup
router.get('/settings/backup', async (_req: Request, res: Response) => {
  try {
    const backupData = await exportDatabaseJSON();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="audiobooks-db-backup.json"');
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate backup' });
  }
});

export default router;
