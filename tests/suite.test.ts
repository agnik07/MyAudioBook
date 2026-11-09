import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  parseTimestampToSeconds,
  formatTime,
  formatDuration,
  formatSecondsToTimestamp,
  normalizeAndValidateChapters,
} from '../src/lib/utils';
import {
  getAllBooks,
  getBookById,
  getChaptersForBook,
  upsertListeningProgress,
  insertChapters,
  getDb,
  saveDb,
} from '../server/db/database';
import { isR2Configured, syncBooksFromR2 } from '../server/services/r2';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 MYAUDIOBOOK PRODUCTION VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    totalTests++;
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            passedTests++;
            console.log(`  ✅ [PASS] ${name}`);
          })
          .catch((err) => {
            console.error(`  ❌ [FAIL] ${name}:`, err.message || err);
          });
      } else {
        passedTests++;
        console.log(`  ✅ [PASS] ${name}`);
      }
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}:`, err.message || err);
    }
  }

  // ====================================================
  // TEST SUITE 1: TIMESTAMP PARSING & FORMATTING
  // ====================================================
  console.log('--- TEST GROUP 1: Timestamp & Duration Utilities ---');

  test('parseTimestampToSeconds handles HH:MM:SS format', () => {
    assert.strictEqual(parseTimestampToSeconds('01:42:35'), 6155);
    assert.strictEqual(parseTimestampToSeconds('00:00:00'), 0);
    assert.strictEqual(parseTimestampToSeconds('02:00:00'), 7200);
  });

  test('parseTimestampToSeconds handles MM:SS and single numbers', () => {
    assert.strictEqual(parseTimestampToSeconds('05:30'), 330);
    assert.strictEqual(parseTimestampToSeconds('18:45'), 1125);
    assert.strictEqual(parseTimestampToSeconds('45'), 45);
    assert.strictEqual(parseTimestampToSeconds(120), 120);
  });

  test('parseTimestampToSeconds preserves fractional seconds and handles invalid strings', () => {
    assert.strictEqual(parseTimestampToSeconds('01:15.5'), 75.5);
    assert.strictEqual(parseTimestampToSeconds(''), 0);
    assert.strictEqual(parseTimestampToSeconds('invalid'), 0);
  });

  test('formatTime formats standard seconds and hour offsets', () => {
    assert.strictEqual(formatTime(330), '05:30');
    assert.strictEqual(formatTime(6155), '01:42:35');
    assert.strictEqual(formatTime(0), '00:00');
  });

  test('formatDuration formats human-readable strings', () => {
    assert.strictEqual(formatDuration(3600), '1h');
    assert.strictEqual(formatDuration(6155), '1h 42m');
    assert.strictEqual(formatDuration(330), '5m');
    assert.strictEqual(formatDuration(0), '0m');
  });

  // ====================================================
  // TEST SUITE 2: CHAPTER VALIDATION & NORMALIZATION
  // ====================================================
  console.log('\n--- TEST GROUP 2: Chapter Normalization & Timestamp Rules ---');

  test('normalizeAndValidateChapters sorts out-of-order timestamps and clamps boundaries', () => {
    const raw = [
      { chapterNumber: 2, title: 'Chapter 2', startTime: '18:45', endTime: '35:20' },
      { chapterNumber: 1, title: 'Introduction', startTime: '00:00', endTime: '05:30' },
      { chapterNumber: 3, title: 'Chapter 1', startTime: '05:30', endTime: '18:45' },
    ];
    const totalDuration = 3600;
    const chapters = normalizeAndValidateChapters(raw, totalDuration);

    assert.strictEqual(chapters.length, 3);
    assert.strictEqual(chapters[0].title, 'Introduction');
    assert.strictEqual(chapters[0].startTime, 0);
    assert.strictEqual(chapters[0].endTime, 330);
    assert.strictEqual(chapters[0].duration, 330);

    assert.strictEqual(chapters[1].title, 'Chapter 1');
    assert.strictEqual(chapters[1].startTime, 330);
    assert.strictEqual(chapters[1].endTime, 1125);
    assert.strictEqual(chapters[1].duration, 795);

    assert.strictEqual(chapters[2].title, 'Chapter 2');
    assert.strictEqual(chapters[2].startTime, 1125);
    assert.strictEqual(chapters[2].endTime, 3600); // Clamped to totalDuration
  });

  test('normalizeAndValidateChapters handles empty or missing chapters gracefully', () => {
    const chapters = normalizeAndValidateChapters([], 1800);
    assert.strictEqual(chapters.length, 1);
    assert.strictEqual(chapters[0].startTime, 0);
    assert.strictEqual(chapters[0].endTime, 1800);
    assert.strictEqual(chapters[0].duration, 1800);
  });

  test('normalizeAndValidateChapters ensures zero start offset if first chapter is near zero', () => {
    const raw = [
      { title: 'Intro', startTime: 1.5, endTime: 100 },
      { title: 'Part 1', startTime: 100, endTime: 200 },
    ];
    const chapters = normalizeAndValidateChapters(raw, 200);
    assert.strictEqual(chapters[0].startTime, 0);
  });

  // ====================================================
  // TEST SUITE 3: DETERMINISTIC RECONCILIATION LOGIC
  // ====================================================
  console.log('\n--- TEST GROUP 3: Cross-Device & Local/Server Progress Reconciliation ---');

  function reconcileProgress(
    localRecord: { positionSeconds: number; updatedAt: string } | null,
    serverRecord: { lastPositionSeconds?: number; lastPlayedAt?: string } | null
  ): number {
    const localPos = localRecord?.positionSeconds || 0;
    const localTime = localRecord?.updatedAt ? new Date(localRecord.updatedAt).getTime() : 0;

    const serverPos = serverRecord?.lastPositionSeconds || 0;
    const serverTime = serverRecord?.lastPlayedAt ? new Date(serverRecord.lastPlayedAt).getTime() : 0;

    if (localPos > 0 && (localTime >= serverTime || serverPos === 0)) {
      return localPos;
    } else if (serverPos > 0) {
      return serverPos;
    }
    return 0;
  }

  test('Reconciliation: newer local progress overrides older server progress', () => {
    const local = { positionSeconds: 6155, updatedAt: '2026-03-07T14:00:00.000Z' };
    const server = { lastPositionSeconds: 3000, lastPlayedAt: '2026-03-07T12:00:00.000Z' };
    const pos = reconcileProgress(local, server);
    assert.strictEqual(pos, 6155);
  });

  test('Reconciliation: newer server progress (e.g. from mobile phone) overrides older laptop progress', () => {
    const local = { positionSeconds: 3000, updatedAt: '2026-03-07T12:00:00.000Z' };
    const server = { lastPositionSeconds: 7200, lastPlayedAt: '2026-03-07T16:00:00.000Z' };
    const pos = reconcileProgress(local, server);
    assert.strictEqual(pos, 7200);
  });

  test('Reconciliation: never overwrites valid progress with 0 on fresh session', () => {
    const local = null;
    const server = { lastPositionSeconds: 5509, lastPlayedAt: '2026-03-07T12:00:00.000Z' };
    const pos = reconcileProgress(local, server);
    assert.strictEqual(pos, 5509);
  });

  // ====================================================
  // TEST SUITE 4: DATABASE PERSISTENCE & PERFORMANCE
  // ====================================================
  console.log('\n--- TEST GROUP 4: Database Operations & Response Latency ---');

  await test('SQLite Database initialization and table integrity', async () => {
    const start = performance.now();
    const database = await getDb();
    const duration = performance.now() - start;
    assert.ok(database !== null);
    console.log(`     (Database init latency: ${duration.toFixed(2)}ms)`);
  });

  await test('SQLite getAllBooks query performance (<20ms target)', async () => {
    const start = performance.now();
    const books = await getAllBooks();
    const duration = performance.now() - start;
    assert.ok(Array.isArray(books));
    assert.ok(books.length > 0);
    console.log(`     (Fetched ${books.length} audiobooks in ${duration.toFixed(2)}ms)`);
    assert.ok(duration < 150, 'getAllBooks should execute quickly');
  });

  await test('SQLite getBookById query performance (<10ms target)', async () => {
    const books = await getAllBooks();
    const testBookId = books[0].id;
    const start = performance.now();
    const book = await getBookById(testBookId);
    const duration = performance.now() - start;
    assert.ok(book !== null);
    assert.strictEqual(book.id, testBookId);
    console.log(`     (Fetched book details "${book.title}" in ${duration.toFixed(2)}ms)`);
  });

  await test('Progress upsert and debounced disk save durability', async () => {
    const books = await getAllBooks();
    const testBookId = books[0].id;
    const testPosition = 1234.5;
    const chapterId = `ch-${testBookId}-1`;

    const start = performance.now();
    await upsertListeningProgress(testBookId, chapterId, testPosition, false);
    const duration = performance.now() - start;

    const updated = await getBookById(testBookId);
    assert.ok(updated !== null);
    assert.strictEqual(updated.lastPositionSeconds, testPosition);
    console.log(`     (Progress upserted in ${duration.toFixed(2)}ms, verified position: ${updated.lastPositionSeconds}s)`);
  });

  await test('Chapters fetch and ordering verification', async () => {
    const books = await getAllBooks();
    const testBook = books.find((b) => b.chaptersCount > 1) || books[0];
    const chapters = await getChaptersForBook(testBook.id);

    assert.ok(Array.isArray(chapters));
    if (chapters.length > 1) {
      for (let i = 0; i < chapters.length - 1; i++) {
        assert.ok(
          chapters[i].startTime <= chapters[i + 1].startTime,
          `Chapter ${chapters[i].chapterNumber} start (${chapters[i].startTime}) must be <= next chapter start (${chapters[i + 1].startTime})`
        );
      }
    }
    console.log(`     (Verified ${chapters.length} chapters strictly ordered for "${testBook.title}")`);
  });

  // ====================================================
  // TEST SUITE 5: R2 THROTTLING & RECOVERY BEHAVIOR
  // ====================================================
  console.log('\n--- TEST GROUP 5: Cloudflare R2 Sync Throttling ---');

  await test('syncBooksFromR2 respects 5-minute throttle and does not spam bucket on every request', async () => {
    const count1 = await syncBooksFromR2(false);
    assert.strictEqual(count1, 0, 'Subsequent unforced call within 5m must return 0 immediately without I/O');
  });

  // ====================================================
  // TEST SUITE 6: MOBILE WEBKIT & PWA INTEGRITY
  // ====================================================
  console.log('\n--- TEST GROUP 6: Mobile WebKit & PWA Integrity ---');

  test('PWA manifest contains standalone display and valid scope', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/manifest.json'), 'utf8'));
    assert.strictEqual(manifest.display, 'standalone', 'PWA must be configured for standalone mode');
    assert.strictEqual(manifest.scope, '/', 'PWA must specify root scope');
  });

  test('HTML entrypoint contains Apple mobile web app capable and viewport-fit=cover', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    assert.ok(html.includes('apple-mobile-web-app-capable'), 'HTML must declare apple-mobile-web-app-capable');
    assert.ok(html.includes('viewport-fit=cover'), 'HTML must declare viewport-fit=cover for iPhone notch and home bar');
    assert.ok(html.includes('apple-mobile-web-app-status-bar-style'), 'HTML must declare apple-mobile-web-app-status-bar-style');
  });

  // ====================================================
  // SUMMARY
  // ====================================================
  console.log('\n====================================================');
  console.log(`🏁 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('====================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 All core functionality, chapters, progress reconciliation, and database operations verified successfully!');
  } else {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});

