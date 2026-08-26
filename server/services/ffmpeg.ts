import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from 'ffmpeg-static';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import path from 'path';
import fs from 'fs';

// Set ffmpeg & ffprobe paths
if (ffmpegInstaller) {
  ffmpeg.setFfmpegPath(ffmpegInstaller);
}

if (ffprobeInstaller && ffprobeInstaller.path) {
  ffmpeg.setFfprobePath(ffprobeInstaller.path);
}

export interface AudioMetadata {
  duration: number; // in seconds
  size: number;     // bytes
  format: string;
}

/**
 * Get audio metadata (duration, format, size)
 */
export function getAudioMetadata(filePath: string): Promise<AudioMetadata> {
  return new Promise((resolve) => {
    const stat = fs.statSync(filePath);
    const defaultSize = stat.size || 0;

    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata || !metadata.format) {
        console.warn('[ffprobe warning]: Could not read metadata via ffprobe, estimating duration:', err?.message);
        // Fallback estimate: 128kbps MP3 (16KB per sec)
        const estimatedDuration = Math.max(60, Math.round(defaultSize / 16000));
        return resolve({
          duration: estimatedDuration,
          size: defaultSize,
          format: 'mp3',
        });
      }

      const duration = metadata.format.duration || 0;
      const size = metadata.format.size || defaultSize;
      const format = metadata.format.format_name || 'mp3';
      resolve({ duration, size, format });
    });
  });
}

/**
 * Slice audio file into chapter segment MP3 using FFmpeg stream copy
 */
export function sliceAudioChapter(
  inputPath: string,
  outputPath: string,
  startTimeSeconds: number,
  durationSeconds: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    ffmpeg(inputPath)
      .setStartTime(startTimeSeconds)
      .setDuration(durationSeconds)
      .outputOptions(['-c copy'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run();
  });
}
