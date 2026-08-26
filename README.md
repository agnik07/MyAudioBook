# MyAudioBook - Private Personal Audiobook Streaming 🎧

A private, single-user personal audiobook library and streaming web application built with **React**, **TypeScript**, **Vite**, **Tailwind CSS**, **Node/Express**, **Google Drive API** (permanent MP3 & cover storage), **SQLite** (local metadata database), and **Groq API** (AI chapter detection).

Features a **premium black + yellow visual identity** (`#050505` / `#FFD600`), HTTP Range Request audio streaming, custom chapter timestamps, auto-advance, listening position memory, global search, filtering, and PWA capabilities.

---

## 🏗 Architecture Overview

```text
                    PHONE / LAPTOP
                          │
                          ▼
                 ┌────────────────┐
                 │     Vercel     │
                 │ React + Vite   │
                 │ Frontend       │
                 └───────┬────────┘
                         │
                         ▼
                 ┌────────────────┐
                 │ Node.js        │
                 │ Express        │
                 │ Backend API    │
                 └───────┬────────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
              ▼          ▼          ▼
       Google Drive   SQLite      Groq API
          Storage     Metadata    AI Processing
              │
              ▼
        Private MP3 files
```

---

## 🔑 1. Google Cloud Project & OAuth 2.0 Setup

Follow these exact steps to connect your private Google Drive:

1. Go to the **[Google Cloud Console](https://console.cloud.google.com/)**.
2. Click **Create Project** (e.g. `MyAudioBook-Storage`).
3. In the left navigation menu, go to **APIs & Services > Library**, search for **Google Drive API**, and click **Enable**.
4. Go to **APIs & Services > OAuth consent screen**:
   - Choose **User Type: External** (or Internal if using Workspace).
   - Fill in App Name (*MyAudioBook*) and User Support Email.
   - Under **Scopes**, add `https://www.googleapis.com/auth/drive.file`.
   - Add your Google Account email under **Test Users**.
5. Go to **APIs & Services > Credentials**:
   - Click **Create Credentials > OAuth client ID**.
   - Select **Application type: Web application**.
   - Add **Authorized redirect URIs**: `http://localhost:3001/api/auth/google/callback` (or your production backend URI).
   - Click **Create** and save your `Client ID` and `Client Secret`.
6. Obtain your `GOOGLE_REFRESH_TOKEN`:
   - Use the Google OAuth 2.0 Playground (`https://developers.google.com/oauthplayground`) or authorize via your browser.
   - Add the scope `https://www.googleapis.com/auth/drive.file`.
   - Exchange the authorization code for tokens and copy your `Refresh Token`.

---

## 🛠 2. Environment Variables Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Fill in your configuration:
```env
# Frontend API URL
VITE_API_BASE_URL=http://localhost:3001

# Google Drive OAuth Credentials (STRICTLY SERVER-SIDE)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
GOOGLE_REFRESH_TOKEN=1//your_refresh_token_here

# Groq AI API Key (STRICTLY SERVER-SIDE)
GROQ_API_KEY=gsk_your_groq_api_key_here

# Backend Port
PORT=3001
```

---

## 🚀 3. Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run both frontend (port 5173) and backend API (port 3001)
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🎧 4. How Audio Streaming & Chaptering Work

1. **Large File Uploads**: Uploading a 250MB–500MB+ MP3 sends a resumable upload directly to Google Drive via Node streams without loading the entire file into backend RAM.
2. **Single Audio File Storage**: The original `audiobook.mp3` is stored once inside `Audiobooks/[Book Title]/` on Google Drive. No physical file duplication.
3. **HTTP Range Audio Streaming**: The backend proxies requested byte ranges using `GET /api/books/:id/audio` with `206 Partial Content` and `Accept-Ranges: bytes`.
4. **Timestamp Seeking**: SQLite stores chapter start/end timestamps. Clicking a chapter sets `audio.currentTime = chapter.startTime`.

---

## 🗄 5. Metadata Backup & Storage Management

- **SQLite Database**: Stored in `server/data/audiobooks.db`.
- **Database Backup**: Click **Export JSON Backup** in **Settings** or visit `http://localhost:3001/api/settings/backup` to download a JSON file of all books, chapters, and progress.
- **Storage Warnings**: Settings monitors Google Drive quota usage and warns if storage exceeds 85%.

---

## 📱 6. Vercel Frontend Deployment

1. Deploy the React application to Vercel (root directory).
2. Set Environment Variable in Vercel Dashboard:
   `VITE_API_BASE_URL=https://your-backend-domain.com`
3. Host the Express backend on a Node server (e.g. Render, Railway, Fly.io, or VPS) with persistent SQLite storage mounted.
