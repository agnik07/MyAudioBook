import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { getDb } from './db/database';
import booksRouter from './routes/books';
import authRouter from './routes/auth';
import { isR2Configured, getR2BucketName } from './services/r2';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize SQLite database & R2 auto-sync
getDb().then(async () => {
  console.log('🗄 SQLite Database initialized (server/data/audiobooks.db)');
  const { syncBooksFromR2 } = await import('./services/r2');
  syncBooksFromR2().then((c) => {
    if (c > 0) console.log(`🎉 Recovered ${c} books from Cloudflare R2 bucket storage!`);
  }).catch(() => {});
}).catch((err) => {
  console.error('Failed to initialize SQLite Database:', err);
});

// Serve uploads statically for local file fallback
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Register API Routes
app.use('/api', booksRouter);
app.use('/api', authRouter);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    groqConfigured: Boolean(process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.includes('your_groq_api_key')),
    cloudflareR2Configured: isR2Configured(),
    r2BucketName: getR2BucketName(),
  });
});

app.listen(PORT, () => {
  console.log(`🎧 Audio streaming backend listening on http://localhost:${PORT}`);
});
