import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBooks } from '../hooks/useBooks';
import { parseTimestampToSeconds } from '../lib/utils';
import { ManualTimestampInput, ProcessingStep } from '../types/audiobook';
import { ManualTimestampForm } from '../components/Upload/ManualTimestampForm';
import { ProcessingStatusUI } from '../components/Upload/ProcessingStatusUI';
import { Upload, Sparkles, Clock, FileAudio, ArrowLeft, AlertCircle, FileText } from 'lucide-react';
import { API_BASE } from '../lib/api';

export const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const { addBook } = useBooks();

  // Form State
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [genre, setGenre] = useState('Self-Improvement');
  const [description, setDescription] = useState('');
  const [detectionMode, setDetectionMode] = useState<'ai' | 'description' | 'manual'>('description');
  const [timestampDescription, setTimestampDescription] = useState(
`00:00 - Introduction & Preface
03:15 - Chapter 1: The Core Concept
14:20 - Chapter 2: Building Strong Habits
28:45 - Chapter 3: Mastering Your Routine
42:10 - Conclusion & Final Thoughts`
  );
  const [manualTimestamps, setManualTimestamps] = useState<ManualTimestampInput[]>([
    { id: '1', chapterNumber: 1, title: 'Chapter 1: Introduction', startTime: '00:00:00' },
    { id: '2', chapterNumber: 2, title: 'Chapter 2: The Core Concept', startTime: '00:15:30' },
  ]);

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStepIndex, setProcessingStepIndex] = useState(0);
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const processingSteps: ProcessingStep[] = [
    { id: '1', label: `Uploading MP3 to Cloudflare R2 Storage (${uploadPercent}%)`, status: uploadPercent === 100 ? 'completed' : 'active' },
    { id: '2', label: 'Reading audio duration with FFmpeg', status: 'pending' },
    { id: '3', label: detectionMode === 'description' ? 'Parsing timestamp description with Groq AI LLM' : 'Transcribing audio with Groq Whisper API', status: 'pending' },
    { id: '4', label: 'Structuring chapters & timestamps', status: 'pending' },
    { id: '5', label: 'Saving audiobook metadata to SQLite database', status: 'pending' },
    { id: '6', label: 'Finalizing audiobook library record', status: 'pending' },
  ];

  const handleAudioDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.includes('audio') || file.name.endsWith('.mp3')) {
        setAudioFile(file);
        if (!title) {
          setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
        }
      }
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !author) {
      alert('Please fill in both Book Title and Author.');
      return;
    }

    if (!audioFile) {
      alert('Please select or drop an MP3 audiobook file to upload.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setProcessingStepIndex(0);
    setUploadPercent(0);

    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      if (coverFile) formData.append('cover', coverFile);
      formData.append('title', title);
      formData.append('author', author);
      formData.append('genre', genre);
      formData.append('description', description);
      formData.append('detectionMode', detectionMode);
      formData.append('timestampDescription', timestampDescription);

      if (detectionMode === 'manual') {
        const parsed = manualTimestamps.map((t) => ({
          ...t,
          startTimeSeconds: parseTimestampToSeconds(t.startTime),
        }));
        formData.append('manualTimestamps', JSON.stringify(parsed));
      }

      // XHR request to monitor upload progress percentage
      const uploadEndpoint = API_BASE ? `${API_BASE}/api/books/upload` : '/api/books/upload';
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadEndpoint, true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadPercent(percentComplete);
          if (percentComplete === 100) {
            setProcessingStepIndex(1);
          }
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText);
          setProcessingStepIndex(4);
          setTimeout(() => setProcessingStepIndex(5), 1000);

          if (response.book) {
            addBook(response.book, response.chapters);
            setTimeout(() => {
              navigate(`/book/${response.book.id}`);
            }, 1800);
          }
        } else {
          try {
            const errRes = JSON.parse(xhr.responseText);
            setErrorMessage(errRes.error || 'Upload processing failed.');
          } catch {
            setErrorMessage(`Upload failed with status code ${xhr.status}`);
          }
          setIsProcessing(false);
        }
      };

      xhr.onerror = () => {
        setErrorMessage('Network connection error during file upload.');
        setIsProcessing(false);
      };

      xhr.send(formData);
    } catch (err: any) {
      console.error(err);
      setIsProcessing(false);
      setErrorMessage(err.message || 'Failed to process audio file.');
    }
  };

  if (isProcessing) {
    return (
      <div className="py-12">
        <ProcessingStatusUI
          steps={processingSteps}
          currentStepIndex={processingStepIndex}
          bookTitle={title}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl bg-[#121212] text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            Upload <span className="text-[#FFD600]">Audiobook</span>
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Store MP3 audiobooks in Cloudflare R2 Object Storage and extract chapter timestamps via Groq AI.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleFormSubmit} className="space-y-6">
        {/* Drag & Drop Audio Upload Box */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleAudioDrop}
          className={`relative border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer ${
            audioFile
              ? 'border-[#FFD600] bg-[#FFD600]/5'
              : 'border-[#262626] hover:border-[#444444] bg-[#0D0D0D]'
          }`}
        >
          <input
            type="file"
            accept="audio/mp3,audio/*"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                const f = e.target.files[0];
                setAudioFile(f);
                if (!title) setTitle(f.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
              }
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />

          <div className="w-14 h-14 rounded-2xl bg-[#1A1A1A] text-[#FFD600] border border-[#2B2B2B] flex items-center justify-center mx-auto mb-3 shadow-yellow-sm">
            <FileAudio className="w-7 h-7" />
          </div>

          {audioFile ? (
            <div className="space-y-1">
              <p className="font-bold text-white text-base truncate max-w-md mx-auto">{audioFile.name}</p>
              <p className="text-xs text-[#FFD600] font-mono">
                {(audioFile.size / (1024 * 1024)).toFixed(1)} MB MP3 ready for Cloudflare R2 upload
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="font-bold text-white text-base">Drag & Drop MP3 Audiobook File Here</p>
              <p className="text-xs text-gray-400">Supports 250 MB, 500 MB+ large audiobook files</p>
            </div>
          )}
        </div>

        {/* Book Information Card */}
        <div className="bg-[#0D0D0D] border border-[#1F1F1F] rounded-2xl p-5 md:p-6 space-y-4">
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <span>Book Information</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Book Title *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Atomic Habits"
                className="w-full bg-[#141414] border border-[#262626] focus:border-[#FFD600] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none"
              />
            </div>

            {/* Author */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Author *</label>
              <input
                type="text"
                required
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. James Clear"
                className="w-full bg-[#141414] border border-[#262626] focus:border-[#FFD600] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none"
              />
            </div>

            {/* Genre */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Genre / Category</label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full bg-[#141414] border border-[#262626] focus:border-[#FFD600] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none cursor-pointer"
              >
                <option value="Self-Improvement">Self-Improvement</option>
                <option value="Productivity">Productivity</option>
                <option value="Finance">Finance</option>
                <option value="Sci-Fi">Sci-Fi</option>
                <option value="Fiction">Fiction</option>
                <option value="Biography">Biography</option>
                <option value="Business">Business</option>
                <option value="Philosophy">Philosophy</option>
              </select>
            </div>

            {/* Cover Upload */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Cover Image (Optional)</label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setCoverFile(e.target.files[0]);
                    }
                  }}
                  className="w-full bg-[#141414] border border-[#262626] rounded-xl px-3.5 py-2 text-xs text-gray-400 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#FFD600] file:text-black hover:file:bg-[#FFE033] cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary or description of the audiobook..."
              className="w-full bg-[#141414] border border-[#262626] focus:border-[#FFD600] rounded-xl p-3 text-sm text-white focus:outline-none"
            />
          </div>
        </div>

        {/* Chapter Detection Mode Selector */}
        <div className="bg-[#0D0D0D] border border-[#1F1F1F] rounded-2xl p-5 md:p-6 space-y-4">
          <h3 className="font-bold text-white text-base">Chapter Separation Mode</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Mode 1: AI Timestamp Description */}
            <label
              onClick={() => setDetectionMode('description')}
              className={`flex flex-col p-4 rounded-xl border cursor-pointer transition-all ${
                detectionMode === 'description'
                  ? 'bg-[#FFD600]/10 border-[#FFD600] text-white shadow-yellow-sm'
                  : 'bg-[#121212] border-[#222222] text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <FileText className={`w-5 h-5 ${detectionMode === 'description' ? 'text-[#FFD600]' : 'text-gray-500'}`} />
                <p className="font-bold text-sm text-white">Timestamp Description</p>
              </div>
              <p className="text-xs text-gray-400">
                Paste a single text description with timestamps & titles. Groq AI parses all chapters automatically!
              </p>
            </label>

            {/* Mode 2: AI Auto Transcription */}
            <label
              onClick={() => setDetectionMode('ai')}
              className={`flex flex-col p-4 rounded-xl border cursor-pointer transition-all ${
                detectionMode === 'ai'
                  ? 'bg-[#FFD600]/10 border-[#FFD600] text-white shadow-yellow-sm'
                  : 'bg-[#121212] border-[#222222] text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className={`w-5 h-5 ${detectionMode === 'ai' ? 'text-[#FFD600]' : 'text-gray-500'}`} />
                <p className="font-bold text-sm text-white">Groq AI Audio Analysis</p>
              </div>
              <p className="text-xs text-gray-400">
                Groq Whisper transcribes the audio and detects chapter boundaries from transcript.
              </p>
            </label>

            {/* Mode 3: Manual Entry */}
            <label
              onClick={() => setDetectionMode('manual')}
              className={`flex flex-col p-4 rounded-xl border cursor-pointer transition-all ${
                detectionMode === 'manual'
                  ? 'bg-[#FFD600]/10 border-[#FFD600] text-white shadow-yellow-sm'
                  : 'bg-[#121212] border-[#222222] text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Clock className={`w-5 h-5 ${detectionMode === 'manual' ? 'text-[#FFD600]' : 'text-gray-500'}`} />
                <p className="font-bold text-sm text-white">Manual List</p>
              </div>
              <p className="text-xs text-gray-400">
                Manually fill individual chapter fields one by one.
              </p>
            </label>
          </div>

          {/* Mode 1 UI: Single Textarea for Timestamp Description */}
          {detectionMode === 'description' && (
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-gray-300">
                  Paste Single Timestamp Description Text
                </label>
                <span className="text-[11px] text-[#FFD600] font-medium">Groq AI Automated Parsing</span>
              </div>
              <textarea
                rows={6}
                value={timestampDescription}
                onChange={(e) => setTimestampDescription(e.target.value)}
                placeholder={`00:00 - Introduction\n03:15 - Chapter 1: The Beginning\n15:40 - Chapter 2: Deep Dive\n30:00 - Conclusion`}
                className="w-full bg-[#141414] border border-[#2B2B2B] focus:border-[#FFD600] rounded-xl p-3.5 text-xs font-mono text-white focus:outline-none leading-relaxed"
              />
              <p className="text-[11px] text-gray-400">
                💡 Paste any YouTube description, tracklist, or text containing timestamps (e.g. <code className="text-[#FFD600]">00:00 Intro</code>, <code className="text-[#FFD600]">05:30 Chapter 1</code>). Groq AI will convert it into chapter segments.
              </p>
            </div>
          )}

          {/* Mode 3 UI: Manual List */}
          {detectionMode === 'manual' && (
            <ManualTimestampForm
              timestamps={manualTimestamps}
              onChange={setManualTimestamps}
            />
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="w-full py-4 rounded-2xl bg-[#FFD600] text-black font-extrabold text-base shadow-yellow-glow hover:bg-[#FFE033] hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2"
        >
          <Upload className="w-5 h-5" /> Upload to Cloudflare R2 & Process
        </button>
      </form>
    </div>
  );
};
