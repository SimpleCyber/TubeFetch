# OmniFetch - Universal Media Downloader

OmniFetch is a powerful browser extension and backend service that allows you to download and manage media from various social platforms, including:
- **YouTube Shorts**
- **Instagram Reels**
- **Pinterest Videos**
- **Facebook Videos/Reels**

## Features
- **Sidebar Interface**: A modern, persistent side panel that stays with you as you browse.
- **Automatic Detection**: Automatically detects media on supported pages.
- **Paste & Fetch**: Paste any link to download directly.
- **Multi-Quality Support**: Choose between different video resolutions and audio formats.
- **Modern UI**: Supports both Light and Dark modes.

## Architecture
- **Frontend**: Chrome Extension (Manifest V3) using the Side Panel API.
- **Backend**: Node.js/Express server utilizing `yt-dlp` for robust media extraction.

## Installation (Local Development)
1. Clone the repository.
2. Load the root folder as an "unpacked extension" in Chrome.
3. Start the backend:
   ```bash
   cd backend
   npm install
   npm run start
   ```

## Privacy
OmniFetch respects your privacy and does not store your video history or personal data. Cookies are processed transiently to facilitate secure downloads.
