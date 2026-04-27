#!/usr/bin/env bash
# exit on error
set -o errexit

# 1. Install dependencies, but skip the automatic yt-dlp download which often fails on Render
export YOUTUBE_DL_SKIP_DOWNLOAD=true
npm install

# 2. Manually download yt-dlp if it's missing
# This location is where youtube-dl-exec looks for it
BIN_DIR="node_modules/youtube-dl-exec/bin"
mkdir -p "$BIN_DIR"

if [ ! -f "$BIN_DIR/yt-dlp" ]; then
    echo "Downloading yt-dlp manually..."
    # Using the official GitHub release link
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "$BIN_DIR/yt-dlp"
    chmod +x "$BIN_DIR/yt-dlp"
    echo "yt-dlp downloaded successfully."
else
    echo "yt-dlp already exists, skipping download."
fi
