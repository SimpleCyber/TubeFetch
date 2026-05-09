# OmniFetch - Universal Video Downloader

OmniFetch is a powerful browser extension and backend service that allows you to download and manage videos from various social platforms, including:

- YouTube
- Instagram (Reels, Posts)
- Pinterest
- Twitter/X
- Facebook

## Features

- **Automatic Detection**: Automatically detects videos on supported pages.
- **Multiple Formats & Qualities**: Choose from various video/audio formats and resolutions before downloading.
- **Side Panel Integration**: Access downloads and manage history directly from Chrome's side panel.
- **Dark Mode**: Supports both light and dark themes.

## Architecture

- **Extension**: Chrome Extension Manifest V3 built with vanilla JS/HTML/CSS.
- **Backend**: Node.js/Express server utilizing `yt-dlp` for robust video extraction.

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
