import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'server', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'audiobooks.db');

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  
  initDatabase(db);
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function initDatabase(database: Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      description TEXT,
      genre TEXT,
      language TEXT DEFAULT 'English',
      r2_audio_key TEXT,
      r2_cover_key TEXT,
      local_file_name TEXT,
      cover_drive_file_id TEXT,
      audio_drive_file_id TEXT,
      drive_folder_id TEXT,
      audio_file_name TEXT,
      file_size INTEGER DEFAULT 0,
      duration_seconds REAL DEFAULT 0,
      processing_status TEXT NOT NULL DEFAULT 'ready',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      chapter_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      start_time REAL DEFAULT 0,
      end_time REAL DEFAULT 0,
      duration REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS listening_progress (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL UNIQUE,
      chapter_id TEXT,
      position_seconds REAL DEFAULT 0,
      completed INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );
  `);

  // Migrate columns if needed for existing DBs
  try { database.exec(`ALTER TABLE books ADD COLUMN r2_audio_key TEXT;`); } catch {}
  try { database.exec(`ALTER TABLE books ADD COLUMN r2_cover_key TEXT;`); } catch {}
  try { database.exec(`ALTER TABLE books ADD COLUMN local_file_name TEXT;`); } catch {}

  saveDb();
}

export async function getAllBooks(query?: string, genre?: string, filterBy?: string, sortBy?: string) {
  const database = await getDb();
  let sql = `
    SELECT b.*, 
           (SELECT COUNT(*) FROM chapters c WHERE c.book_id = b.id) as chaptersCount,
           (SELECT COUNT(*) FROM favorites f WHERE f.book_id = b.id) > 0 as isFavorite,
           lp.chapter_id as currentChapterId,
           lp.position_seconds as lastPositionSeconds,
           lp.completed as completed
    FROM books b
    LEFT JOIN listening_progress lp ON b.id = lp.book_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (query) {
    sql += ` AND (LOWER(b.title) LIKE ? OR LOWER(b.author) LIKE ? OR LOWER(b.genre) LIKE ?)`;
    const q = `%${query.toLowerCase()}%`;
    params.push(q, q, q);
  }

  if (genre) {
    sql += ` AND LOWER(b.genre) = ?`;
    params.push(genre.toLowerCase());
  }

  if (filterBy === 'favorites') {
    sql += ` AND b.id IN (SELECT book_id FROM favorites)`;
  } else if (filterBy === 'completed') {
    sql += ` AND lp.completed = 1`;
  } else if (filterBy === 'in_progress') {
    sql += ` AND lp.position_seconds > 0 AND (lp.completed IS NULL OR lp.completed = 0)`;
  } else if (filterBy === 'not_started') {
    sql += ` AND (lp.position_seconds IS NULL OR lp.position_seconds = 0)`;
  }

  if (sortBy === 'title') {
    sql += ` ORDER BY b.title ASC`;
  } else if (sortBy === 'author') {
    sql += ` ORDER BY b.author ASC`;
  } else if (sortBy === 'recently_played') {
    sql += ` ORDER BY lp.updated_at DESC, b.created_at DESC`;
  } else {
    sql += ` ORDER BY b.created_at DESC`;
  }

  const stmt = database.prepare(sql);
  stmt.bind(params);

  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    let progressPercentage = 0;
    const dur = Number(row.duration_seconds) || 0;
    const pos = Number(row.lastPositionSeconds) || 0;
    if (pos && dur > 0) {
      progressPercentage = Math.min(100, Math.round((pos / dur) * 100));
    }

    const r2CoverKey = row.r2_cover_key ? String(row.r2_cover_key) : null;
    const driveCoverId = row.cover_drive_file_id ? String(row.cover_drive_file_id) : null;

    results.push({
      id: String(row.id),
      title: String(row.title),
      author: String(row.author),
      description: String(row.description || ''),
      genre: String(row.genre || 'Audiobook'),
      language: String(row.language || 'English'),
      r2AudioKey: row.r2_audio_key ? String(row.r2_audio_key) : null,
      r2CoverKey: r2CoverKey,
      localFileName: row.local_file_name ? String(row.local_file_name) : (row.audio_file_name ? String(row.audio_file_name) : null),
      coverDriveFileId: driveCoverId,
      audioDriveFileId: row.audio_drive_file_id ? String(row.audio_drive_file_id) : null,
      driveFolderId: row.drive_folder_id ? String(row.drive_folder_id) : null,
      audioFileName: String(row.audio_file_name || ''),
      fileSize: Number(row.file_size) || 0,
      totalDuration: dur,
      processingStatus: String(row.processing_status || 'ready'),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      isFavorite: Boolean(row.isFavorite),
      chaptersCount: Number(row.chaptersCount) || 0,
      progressPercentage,
      currentChapterId: row.currentChapterId ? String(row.currentChapterId) : undefined,
      lastPositionSeconds: pos,
      completed: Boolean(row.completed),
      coverUrl: (r2CoverKey || driveCoverId)
        ? `/api/books/${row.id}/cover`
        : 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
    });
  }
  stmt.free();
  return results;
}

export async function getBookById(id: string) {
  const database = await getDb();
  const sql = `
    SELECT b.*, 
           (SELECT COUNT(*) FROM favorites f WHERE f.book_id = b.id) > 0 as isFavorite,
           lp.chapter_id as currentChapterId,
           lp.position_seconds as lastPositionSeconds,
           lp.completed as completed
    FROM books b
    LEFT JOIN listening_progress lp ON b.id = lp.book_id
    WHERE b.id = ?
  `;

  const stmt = database.prepare(sql);
  stmt.bind([id]);

  if (!stmt.step()) {
    stmt.free();
    return null;
  }

  const row = stmt.getAsObject();
  stmt.free();

  let progressPercentage = 0;
  const dur = Number(row.duration_seconds) || 0;
  const pos = Number(row.lastPositionSeconds) || 0;
  if (pos && dur > 0) {
    progressPercentage = Math.min(100, Math.round((pos / dur) * 100));
  }

  const r2CoverKey = row.r2_cover_key ? String(row.r2_cover_key) : null;
  const driveCoverId = row.cover_drive_file_id ? String(row.cover_drive_file_id) : null;

  return {
    id: String(row.id),
    title: String(row.title),
    author: String(row.author),
    description: String(row.description || ''),
    genre: String(row.genre || 'Audiobook'),
    language: String(row.language || 'English'),
    r2AudioKey: row.r2_audio_key ? String(row.r2_audio_key) : null,
    r2CoverKey: r2CoverKey,
    localFileName: row.local_file_name ? String(row.local_file_name) : (row.audio_file_name ? String(row.audio_file_name) : null),
    coverDriveFileId: driveCoverId,
    audioDriveFileId: row.audio_drive_file_id ? String(row.audio_drive_file_id) : null,
    driveFolderId: row.drive_folder_id ? String(row.drive_folder_id) : null,
    audioFileName: String(row.audio_file_name || ''),
    fileSize: Number(row.file_size) || 0,
    totalDuration: dur,
    processingStatus: String(row.processing_status || 'ready'),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    isFavorite: Boolean(row.isFavorite),
    progressPercentage,
    currentChapterId: row.currentChapterId ? String(row.currentChapterId) : undefined,
    lastPositionSeconds: pos,
    completed: Boolean(row.completed),
    coverUrl: (r2CoverKey || driveCoverId)
      ? `/api/books/${row.id}/cover`
      : 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
  };
}

export async function insertBook(book: any) {
  const database = await getDb();
  const stmt = database.prepare(`
    INSERT INTO books (
      id, title, author, description, genre, language,
      r2_audio_key, r2_cover_key, local_file_name,
      cover_drive_file_id, audio_drive_file_id, drive_folder_id,
      audio_file_name, file_size, duration_seconds, processing_status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    book.id,
    book.title,
    book.author,
    book.description || '',
    book.genre || 'Audiobook',
    book.language || 'English',
    book.r2AudioKey || null,
    book.r2CoverKey || null,
    book.localFileName || null,
    book.coverDriveFileId || null,
    book.audioDriveFileId || null,
    book.driveFolderId || null,
    book.audioFileName || '',
    book.fileSize || 0,
    book.totalDuration || 0,
    book.processingStatus || 'ready',
    book.createdAt || new Date().toISOString(),
    book.updatedAt || new Date().toISOString(),
  ]);

  stmt.free();
  saveDb();
}

export async function deleteBookRecord(id: string) {
  const database = await getDb();
  const stmt = database.prepare(`DELETE FROM books WHERE id = ?`);
  stmt.run([id]);
  stmt.free();
  saveDb();
}

export async function getChaptersForBook(bookId: string) {
  const database = await getDb();
  const stmt = database.prepare(`
    SELECT * FROM chapters WHERE book_id = ? ORDER BY chapter_number ASC
  `);
  stmt.bind([bookId]);

  const chapters = [];
  while (stmt.step()) {
    const c = stmt.getAsObject();
    chapters.push({
      id: String(c.id),
      bookId: String(c.book_id),
      chapterNumber: Number(c.chapter_number),
      title: String(c.title),
      startTime: Number(c.start_time) || 0,
      endTime: Number(c.end_time) || 0,
      duration: Number(c.duration) || 0,
      audioUrl: `/api/books/${c.book_id}/audio`,
    });
  }
  stmt.free();
  return chapters;
}

export async function insertChapters(chapters: any[]) {
  const database = await getDb();
  const stmt = database.prepare(`
    INSERT INTO chapters (id, book_id, chapter_number, title, start_time, end_time, duration, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of chapters) {
    stmt.run([
      item.id,
      item.bookId,
      item.chapterNumber,
      item.title,
      item.startTime || 0,
      item.endTime || 0,
      item.duration || 0,
      new Date().toISOString(),
    ]);
  }
  stmt.free();
  saveDb();
}

export async function upsertListeningProgress(bookId: string, chapterId: string, positionSeconds: number, completed: boolean) {
  const database = await getDb();
  const id = `prog-${bookId}`;
  const now = new Date().toISOString();

  // Check if exists
  const checkStmt = database.prepare(`SELECT id FROM listening_progress WHERE book_id = ?`);
  checkStmt.bind([bookId]);
  const exists = checkStmt.step();
  checkStmt.free();

  if (exists) {
    const updateStmt = database.prepare(`
      UPDATE listening_progress 
      SET chapter_id = ?, position_seconds = ?, completed = ?, updated_at = ?
      WHERE book_id = ?
    `);
    updateStmt.run([chapterId, positionSeconds, completed ? 1 : 0, now, bookId]);
    updateStmt.free();
  } else {
    const insertStmt = database.prepare(`
      INSERT INTO listening_progress (id, book_id, chapter_id, position_seconds, completed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run([id, bookId, chapterId, positionSeconds, completed ? 1 : 0, now]);
    insertStmt.free();
  }

  saveDb();
}

export async function toggleFavoriteRecord(bookId: string) {
  const database = await getDb();
  const checkStmt = database.prepare(`SELECT id FROM favorites WHERE book_id = ?`);
  checkStmt.bind([bookId]);
  const exists = checkStmt.step();
  checkStmt.free();

  if (exists) {
    const delStmt = database.prepare(`DELETE FROM favorites WHERE book_id = ?`);
    delStmt.run([bookId]);
    delStmt.free();
    saveDb();
    return false;
  } else {
    const id = `fav-${bookId}`;
    const insStmt = database.prepare(`INSERT INTO favorites (id, book_id, created_at) VALUES (?, ?, ?)`);
    insStmt.run([id, bookId, new Date().toISOString()]);
    insStmt.free();
    saveDb();
    return true;
  }
}

export async function exportDatabaseJSON() {
  const database = await getDb();
  
  const getRows = (sql: string) => {
    const s = database.prepare(sql);
    const rows = [];
    while (s.step()) rows.push(s.getAsObject());
    s.free();
    return rows;
  };

  return {
    version: '3.0',
    exportedAt: new Date().toISOString(),
    books: getRows(`SELECT * FROM books`),
    chapters: getRows(`SELECT * FROM chapters`),
    listening_progress: getRows(`SELECT * FROM listening_progress`),
    favorites: getRows(`SELECT * FROM favorites`),
  };
}
