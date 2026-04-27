const express  = require('express');
const cors     = require('cors');
const youtubedl = require('youtube-dl-exec');
const { spawn } = require('child_process');
const { constants } = require('youtube-dl-exec');

const app = express();
const PORT = 4000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── In-memory Cache & State ──────────────────────────────────────────────────
const INFO_CACHE = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const inFlight = new Map();

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCached(key) {
    const entry = INFO_CACHE.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        INFO_CACHE.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key, data) {
    INFO_CACHE.set(key, { data, ts: Date.now() });
}

/**
 * Sanitizes a YouTube URL to a clean watch URL with only the video ID.
 */
function sanitizeYouTubeUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        let videoId = '';

        if (parsed.hostname === 'youtu.be') {
            videoId = parsed.pathname.slice(1).split('/')[0];
        } else {
            videoId = parsed.searchParams.get('v');
        }

        if (!videoId) throw new Error('No video ID found in URL');
        return { cleanUrl: `https://www.youtube.com/watch?v=${videoId}`, videoId };
    } catch (e) {
        throw new Error(`Invalid YouTube URL: ${e.message}`);
    }
}

// ── API Documentation (Root Endpoint) ────────────────────────────────────────

app.get('/', (req, res) => {
    const documentation = {
        name: "TubeFetch Backend API",
        description: "A high-performance YouTube metadata and streaming service powered by yt-dlp.",
        version: "1.1.0",
        endpoints: [
            {
                path: "/info",
                method: "GET",
                params: { url: "YouTube video URL" },
                description: "Returns video title, thumbnail, duration, and available formats with height/quality metadata.",
                example: `http://localhost:${PORT}/info?url=https://www.youtube.com/watch?v=aqz-KE-bpKQ`
            },
            {
                path: "/download",
                method: "GET",
                params: { 
                    url: "YouTube video URL", 
                    format: "Optional format_id (e.g. 137, 18, 251)",
                    filename: "Optional custom filename for the download"
                },
                description: "Streams the video/audio directly to the browser. Automatically handles high-quality merging (video+audio) if needed.",
                example: `http://localhost:${PORT}/download?url=...&format=137&filename=cool_video.mp4`
            },
            {
                path: "/download-url",
                method: "GET",
                params: { url: "YouTube video URL", format: "format_id" },
                description: "Returns the direct YouTube CDN URL (for debugging purposes).",
                example: `http://localhost:${PORT}/download-url?url=...&format=18`
            }
        ],
        usage: {
            step1: "Call /info to get the list of formats and the video ID.",
            step2: "Select a format_id from the response.",
            step3: "Call /download with that format_id to start the stream."
        }
    };

    // Serve as pretty JSON
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(documentation, null, 4));
});

// ── GET /info?url=<youtube_url> ───────────────────────────────────────────────

app.get('/info', async (req, res) => {
    const rawUrl = req.query.url;
    if (!rawUrl) return res.status(400).json({ error: 'URL is required' });

    let cleanUrl, videoId;
    try {
        ({ cleanUrl, videoId } = sanitizeYouTubeUrl(rawUrl));
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }

    const cached = getCached(videoId);
    if (cached) return res.json(cached);

    if (inFlight.has(videoId)) {
        try { return res.json(await inFlight.get(videoId)); } 
        catch (e) { return res.status(500).json({ error: 'In-flight fetch failed' }); }
    }

    const fetchPromise = youtubedl(cleanUrl, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        noPlaylist: true,
        addHeader: [
            'referer:youtube.com',
            'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
        extractorArgs: 'youtube:player_client=android_vr,web'
    }).then(output => {
        const formats = output.formats
            .filter(f => f.vcodec !== 'none' || f.acodec !== 'none')
            .map(f => ({
                format_id: f.format_id,
                extension: f.ext,
                quality:   f.format_note || f.resolution || 'unknown',
                height:    f.height || 0,
                has_audio: f.acodec !== 'none',
                has_video: f.vcodec !== 'none',
                filesize:  f.filesize || f.filesize_approx || null,
                url:       f.url
            }))
            .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.filesize || 0) - (a.filesize || 0));

        const result = {
            title:     output.title,
            thumbnail: output.thumbnail,
            duration:  output.duration,
            formats
        };

        setCache(videoId, result);
        return result;
    });

    inFlight.set(videoId, fetchPromise);

    try {
        res.json(await fetchPromise);
    } catch (error) {
        console.error('[/info] Error:', error.stderr || error.message);
        res.status(500).json({ 
            error: 'Failed to fetch video information', 
            details: error.message,
            stderr: error.stderr || null
        });
    } finally {
        inFlight.delete(videoId);
    }
});

// ── GET /health ──────────────────────────────────────────────────────────────

app.get('/health', async (req, res) => {
    try {
        const { constants } = require('youtube-dl-exec');
        const { execSync } = require('child_process');
        const version = execSync(`"${constants.YOUTUBE_DL_PATH}" --version`).toString().trim();
        res.json({ status: 'ok', ytDlpVersion: version, platform: process.platform });
    } catch (e) {
        res.status(500).json({ status: 'error', error: e.message, stderr: e.stderr?.toString() });
    }
});

// ── GET /download?url=<youtube_url>&format=<format_id>&filename=<name> ────────

app.get('/download', async (req, res) => {
    const { url: rawUrl, format: formatId, filename = 'download' } = req.query;

    if (!rawUrl) return res.status(400).json({ error: 'URL is required' });

    let cleanUrl, videoId;
    try {
        ({ cleanUrl, videoId } = sanitizeYouTubeUrl(rawUrl));
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }

    let ext = 'mp4';
    const cached = getCached(videoId);
    const fmt = cached?.formats.find(f => f.format_id === formatId);
    if (fmt) ext = fmt.extension;

    const args = [
        '--no-warnings',
        '--no-playlist',
        '--no-check-certificates',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--extractor-args', 'youtube:player_client=android_vr,web',
        '-o', '-', 
    ];

    if (formatId) {
        if (fmt && fmt.has_video && !fmt.has_audio) {
            args.push('-f', `${formatId}+bestaudio/best`);
        } else {
            args.push('-f', formatId);
        }
    } else {
        args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best');
    }
    args.push(cleanUrl);

    const ytProc = spawn(constants.YOUTUBE_DL_PATH, args);
    let headersSent = false;

    ytProc.stdout.on('data', chunk => {
        if (!headersSent) {
            const safeName = filename.replace(/[^\x20-\x7E]/g, '').replace(/"/g, "'");
            const encodedName = encodeURIComponent(filename);
            res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`);
            res.setHeader('Content-Type', ext === 'webm' ? 'video/webm' : 'video/mp4');
            headersSent = true;
        }
        res.write(chunk);
    });

    ytProc.stdout.on('end', () => {
        if (!headersSent && !res.headersSent) {
            res.status(500).json({ error: 'No data received from downloader' });
        } else {
            res.end();
        }
    });

    ytProc.stderr.on('data', d => {
        const msg = d.toString().trim();
        if (msg) console.log(`[/download][yt-dlp] ${msg}`);
    });

    ytProc.on('error', err => {
        console.error('[/download] spawn error:', err.message);
        if (!res.headersSent) res.status(500).json({ 
            error: 'Streaming process failed', 
            details: err.message 
        });
    });

    ytProc.on('close', () => {
        if (!res.writableEnded) res.end();
    });

    req.on('close', () => {
        if (!ytProc.killed) ytProc.kill('SIGTERM');
    });
});

// ── GET /download-url?url=<youtube_url>&format=<format_id> ───────────────────

app.get('/download-url', async (req, res) => {
    const { url: rawUrl, format: formatId } = req.query;
    if (!rawUrl) return res.status(400).json({ error: 'URL is required' });

    let cleanUrl, videoId;
    try {
        ({ cleanUrl, videoId } = sanitizeYouTubeUrl(rawUrl));
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }

    const cached = getCached(videoId);
    if (cached && formatId) {
        const fmt = cached.formats.find(f => f.format_id === formatId);
        if (fmt?.url) return res.json({ url: fmt.url, filename: `${cached.title}.${fmt.extension}` });
    }

    try {
        const output = await youtubedl(cleanUrl, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            format: formatId || 'bestvideo+bestaudio/best',
        });
        let downloadUrl = output.url || output.requested_formats?.[0]?.url;
        if (!downloadUrl) return res.status(500).json({ error: 'No downloadable URL found' });
        res.json({ url: downloadUrl, filename: `${output.title}.${output.ext}` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get download URL', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ TubeFetch backend running on http://localhost:${PORT}`);
});
