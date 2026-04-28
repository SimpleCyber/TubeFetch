const express  = require('express');
const cors     = require('cors');
const youtubedl = require('youtube-dl-exec');
const { spawn } = require('child_process');
const { constants } = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = 4000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── In-memory Cache & State ──────────────────────────────────────────────────
const INFO_CACHE = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const inFlight = new Map();

// ── Cookie & Session Management ──────────────────────────────────────────────
const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
const SESSION_COOKIES = new Map();

/**
 * Saves cookie string to a temporary file and returns the path.
 */
function createTempCookieFile(cookieString) {
    const tempPath = path.join(os.tmpdir(), `yt_cookie_${crypto.randomUUID()}.txt`);
    fs.writeFileSync(tempPath, cookieString);
    return tempPath;
}

/**
 * Deletes a temporary file if it exists.
 */
function cleanupTempFile(filePath) {
    try {
        if (filePath && filePath.includes(os.tmpdir()) && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (e) {
        console.error('Cleanup failed:', e.message);
    }
}

/**
 * Returns cookie option (file path) based on sessionId or default cookies.txt
 */
function getCookieOption(sessionId) {
    console.log(`[Cookies] Checking options for session: ${sessionId || 'none'}`);
    
    // 1. Check if we have user-provided cookies for this session
    if (sessionId && SESSION_COOKIES.has(sessionId)) {
        const cookieStr = SESSION_COOKIES.get(sessionId);
        console.log(`[Cookies] Found session cookies (${cookieStr.length} bytes)`);
        const tempFile = createTempCookieFile(cookieStr);
        return { cookies: tempFile, isTemp: true };
    }

    // 2. Fallback to global cookies.txt
    if (fs.existsSync(COOKIES_PATH)) {
        console.log(`[Cookies] Using global cookies.txt`);
        return { cookies: COOKIES_PATH, isTemp: false };
    }

    // 3. Fallback to browser cookies (only if running locally)
    const isLocal = !process.env.RENDER && !process.env.PORT; // Crude check for local env
    if (isLocal) {
        console.log(`[Cookies] Local environment detected, will try --cookies-from-browser chrome`);
        return { cookiesFromBrowser: 'chrome' };
    }

    console.log(`[Cookies] No cookies found`);
    return {};
}

/**
 * Parses Netscape cookie file content into a 'Cookie' header string.
 */
function parseNetscapeCookies(filePath) {
    try {
        if (!fs.existsSync(filePath)) return '';
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const cookies = [];
        
        for (const line of lines) {
            if (!line.trim() || line.startsWith('#')) continue;
            const parts = line.split('\t');
            if (parts.length >= 7) {
                cookies.push(`${parts[5]}=${parts[6].trim()}`);
            }
        }
        return cookies.join('; ');
    } catch (e) {
        console.error('Cookie parsing failed:', e.message);
        return '';
    }
}

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
 * Sanitizes URLs. Performs specific cleaning for YouTube, otherwise returns as is.
 */
function sanitizeUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        
        // YouTube specific sanitization
        if (parsed.hostname.includes('youtube.com') || parsed.hostname === 'youtu.be') {
            let videoId = '';
            if (parsed.hostname === 'youtu.be') {
                videoId = parsed.pathname.slice(1).split('/')[0];
            } else {
                videoId = parsed.searchParams.get('v');
            }
            if (videoId) {
                return { cleanUrl: `https://www.youtube.com/watch?v=${videoId}`, id: videoId };
            }
        }

        // Default: return as is
        return { cleanUrl: rawUrl, id: rawUrl };
    } catch (e) {
        throw new Error(`Invalid URL: ${e.message}`);
    }
}

// ── API Documentation (Root Endpoint) ────────────────────────────────────────

app.get('/', (req, res) => {
    const documentation = {
        name: "OmniFetch Backend API",
        description: "A high-performance universal media metadata and streaming service powered by yt-dlp.",
        version: "1.2.0",
        endpoints: [
            {
                path: "/info",
                method: "GET",
                params: { url: "Media URL (YouTube, Instagram, Pinterest, etc.)" },
                description: "Returns video title, thumbnail, duration, and available formats with height/quality metadata.",
                example: `https://tubefetch-us1e.onrender.com/info?url=https://www.youtube.com/watch?v=aqz-KE-bpKQ`
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
                example: `https://tubefetch-us1e.onrender.com/download?url=...&format=137&filename=cool_video.mp4`
            },
            {
                path: "/download-url",
                method: "GET",
                params: { url: "YouTube video URL", format: "format_id" },
                description: "Returns the direct YouTube CDN URL (for debugging purposes).",
                example: `https://tubefetch-us1e.onrender.com/download-url?url=...&format=18`
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

// ── GET & POST /info ─────────────────────────────────────────────────────────

app.all('/info', async (req, res) => {
    const rawUrl = req.method === 'POST' ? req.body.url : req.query.url;
    const userCookies = req.method === 'POST' ? req.body.cookies : null;
    const sessionId = req.method === 'POST' ? req.body.sessionId : req.query.sessionId;

    if (!rawUrl) return res.status(400).json({ error: 'URL is required' });

    // Store cookies if provided in POST
    if (userCookies && sessionId) {
        console.log(`[POST /info] Received cookies for session: ${sessionId} (${userCookies.length} bytes)`);
        SESSION_COOKIES.set(sessionId, userCookies);
        // Clear cookies after 30 mins to avoid memory leaks
        setTimeout(() => {
            if (SESSION_COOKIES.has(sessionId)) {
                console.log(`[Session] Expiring cookies for: ${sessionId}`);
                SESSION_COOKIES.delete(sessionId);
            }
        }, 30 * 60 * 1000);
    } else if (req.method === 'POST') {
        console.warn(`[POST /info] Missing cookies or sessionId. Body keys: ${Object.keys(req.body)}`);
    }

    let cleanUrl, id;
    try {
        ({ cleanUrl, id } = sanitizeUrl(rawUrl));
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }

    const cached = sessionId ? null : getCached(id);
    if (cached) return res.json(cached);

    if (!sessionId && inFlight.has(id)) {
        try { return res.json(await inFlight.get(id)); } 
        catch (e) { return res.status(500).json({ error: 'In-flight fetch failed' }); }
    }

    const cookieData = getCookieOption(sessionId);
    
    const urlObj = new URL(cleanUrl);
    const fetchPromise = youtubedl(cleanUrl, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        noPlaylist: true,
        forceIpv4: true,
        noCacheDir: true,
        jsRuntimes: 'node',
        referer: `${urlObj.protocol}//${urlObj.hostname}/`,
        addHeader: [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        ],
        extractorArgs: 'youtube:player_client=android,web',
        cookies: cookieData.cookies,
        cookiesFromBrowser: cookieData.cookiesFromBrowser
    }).then(output => {
        if (cookieData.isTemp) cleanupTempFile(cookieData.cookies);
        let formats = output.formats
            .filter(f => {
                // Keep only valid media formats
                const isMedia = f.vcodec !== 'none' || f.acodec !== 'none';
                if (!isMedia) return false;
                
                // Exclude extremely low quality (less than 360p) unless it's the only option
                // and ignore 'story' or 'manifest' only formats that often return JSON/errors
                if (f.height && f.height < 360 && output.formats.some(fmt => fmt.height >= 360)) return false;
                if (f.format_note && f.format_note.toLowerCase().includes('story')) return false;
                
                return true;
            })
            .map(f => ({
                format_id: f.format_id,
                extension: f.ext,
                quality:   f.format_note || f.resolution || (f.height ? `${f.height}p` : 'unknown'),
                height:    f.height || 0,
                has_audio: f.acodec !== 'none' && f.acodec !== 'null',
                has_video: f.vcodec !== 'none' && f.vcodec !== 'null',
                is_image:  false,
                filesize:  f.filesize || f.filesize_approx || null,
                url:       f.url
            }));

        // If no video/audio formats, or if it's a known image platform, add image formats
        const isImagePlatform = cleanUrl.includes('instagram.com/p/') || cleanUrl.includes('pinterest.com/pin/') || cleanUrl.includes('pinimg.com');
        
        if (formats.length === 0 || isImagePlatform) {
            // Add thumbnails as image formats if they look high-res or if it's the only option
            const images = (output.thumbnails || [])
                .filter(t => t.url && (t.width > 500 || t.id === 'og:image'))
                .map((t, i) => ({
                    format_id: `img_${i}`,
                    extension: t.url.includes('.webp') ? 'webp' : 'jpg',
                    quality:   t.width ? `${t.width}px Width` : 'High Res',
                    height:    t.height || 0,
                    has_audio: false,
                    has_video: false,
                    is_image:  true,
                    url:       t.url
                }));
            
            // Also check the main 'url' field if it's an image
            if (output.url && (output.url.includes('.jpg') || output.url.includes('.png') || output.url.includes('.webp'))) {
                 images.push({
                    format_id: 'img_main',
                    extension: output.ext || 'jpg',
                    quality: 'Original Image',
                    height: output.height || 0,
                    has_audio: false,
                    has_video: false,
                    is_image: true,
                    url: output.url
                 });
            }
            
            formats = [...formats, ...images];
        }

        formats.sort((a, b) => (b.height || 0) - (a.height || 0) || (b.filesize || 0) - (a.filesize || 0));

        const result = {
            title:     output.title,
            thumbnail: output.thumbnail,
            duration:  output.duration,
            formats
        };

        if (!sessionId) setCache(id, result);
        return result;
    });

    if (!sessionId) inFlight.set(id, fetchPromise);

    try {
        res.json(await fetchPromise);
    } catch (error) {
        if (cookieData.isTemp) cleanupTempFile(cookieData.cookies);
        console.error('[/info] Error:', error.stderr || error.message);
        res.status(500).json({ 
            error: 'Failed to fetch video information', 
            details: error.message,
            stderr: error.stderr || null
        });
    } finally {
        if (!sessionId) inFlight.delete(id);
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
    const { url: rawUrl, format: formatId, filename = 'download', sessionId } = req.query;

    if (!rawUrl) return res.status(400).json({ error: 'URL is required' });

    let cleanUrl, id;
    try {
        ({ cleanUrl, id } = sanitizeUrl(rawUrl));
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }

    let ext = 'mp4';
    const cached = getCached(id);
    const fmt = cached?.formats.find(f => f.format_id === formatId);
    if (fmt) ext = fmt.extension;

    const cookieData = getCookieOption(sessionId);
    const cleanFormatId = formatId ? String(formatId).trim() : null;

    // ── Handle Image Downloads ───────────────────────────────────────────────
    if (cleanFormatId && cleanFormatId.startsWith('img_')) {
        let imageUrl = '';
        if (fmt) {
            imageUrl = fmt.url;
        } else {
            return res.status(404).json({ error: 'Image format not found in cache. Please refresh info.' });
        }

        try {
            console.log(`[/download] Fetching image: ${imageUrl}`);
            const headers = { 
                'Referer': `${new URL(cleanUrl).protocol}//${new URL(cleanUrl).hostname}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
            };
            
            if (cookieData.cookies) {
                const cookieHeader = parseNetscapeCookies(cookieData.cookies);
                if (cookieHeader) headers['Cookie'] = cookieHeader;
            }
            
            const imgRes = await fetch(imageUrl, { headers });
            if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.statusText} (${imgRes.status})`);
            
            const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
            res.setHeader('Content-Type', contentType);
            const safeName = filename.replace(/[^\x20-\x7E]/g, '').replace(/"/g, "'");
            const encodedName = encodeURIComponent(filename);
            res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`);
            
            const buffer = await imgRes.arrayBuffer();
            return res.send(Buffer.from(buffer));
        } catch (e) {
            return res.status(500).json({ error: 'Failed to download image', details: e.message });
        }
    }

    const urlObj = new URL(cleanUrl);
    const args = [
        '--no-warnings',
        '--no-playlist',
        '--no-check-certificates',
        '--force-ipv4',
        '--no-cache-dir',
        '--js-runtimes', 'node',
        '--referer', `${urlObj.protocol}//${urlObj.hostname}/`,
        '--add-header', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        '-o', '-', 
    ];

    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname === 'youtu.be') {
        args.push('--extractor-args', 'youtube:player_client=android,web');
    }
    if (cookieData.cookies) {
        args.push('--cookies', cookieData.cookies);
    } else if (cookieData.cookiesFromBrowser) {
        args.push('--cookies-from-browser', cookieData.cookiesFromBrowser);
    }

    if (cleanFormatId) {
        if (fmt) {
            if (fmt.has_video && !fmt.has_audio) {
                args.push('-f', `${cleanFormatId}+bestaudio/bestvideo+bestaudio/best/${cleanFormatId}/best`);
            } else {
                args.push('-f', `${cleanFormatId}/bestvideo+bestaudio/best`);
            }
        } else {
            args.push('-f', `${cleanFormatId}+bestaudio/bestvideo+bestaudio/best/${cleanFormatId}/best`);
        }
    } else {
        args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best');
    }
    args.push(cleanUrl);

    console.log(`[/download] Executing: yt-dlp ${args.join(' ')}`);

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
        if (cookieData.isTemp) cleanupTempFile(cookieData.cookies);
        if (!res.writableEnded) res.end();
    });

    req.on('close', () => {
        if (!ytProc.killed) ytProc.kill('SIGTERM');
    });
});

// ── GET /download-url?url=<youtube_url>&format=<format_id> ───────────────────

app.get('/download-url', async (req, res) => {
    const { url: rawUrl, format: formatId, sessionId } = req.query;
    if (!rawUrl) return res.status(400).json({ error: 'URL is required' });

    let cleanUrl, id;
    try {
        ({ cleanUrl, id } = sanitizeUrl(rawUrl));
    } catch (e) {
        return res.status(400).json({ error: e.message });
    }

    const cached = getCached(id);
    if (cached && formatId) {
        const fmt = cached.formats.find(f => f.format_id === formatId);
        if (fmt?.url) return res.json({ url: fmt.url, filename: `${cached.title}.${fmt.extension}` });
    }

    const cookieData = getCookieOption(sessionId);

    try {
        const output = await youtubedl(cleanUrl, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            forceIpv4: true,
            noCacheDir: true,
            jsRuntimes: 'node',
            referer: 'https://www.youtube.com',
            extractorArgs: 'youtube:player_client=android,web',
            format: formatId || 'bestvideo+bestaudio/best',
            cookies: cookieData.cookies,
            cookiesFromBrowser: cookieData.cookiesFromBrowser
        });
        if (cookieData.isTemp) cleanupTempFile(cookieData.cookies);
        let downloadUrl = output.url || output.requested_formats?.[0]?.url;
        if (!downloadUrl) return res.status(500).json({ error: 'No downloadable URL found' });
        res.json({ url: downloadUrl, filename: `${output.title}.${output.ext}` });
    } catch (error) {
        if (cookieData.isTemp) cleanupTempFile(cookieData.cookies);
        res.status(500).json({ error: 'Failed to get download URL', details: error.message });
    }
});
app.get('/privacy', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Privacy Policy - TubeFetch</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 40px 20px; background: #f9f9f9; }
                .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
                h1 { color: #ff0000; margin-top: 0; }
                h2 { color: #1a1a1a; margin-top: 30px; }
                p { margin-bottom: 20px; }
                .footer { margin-top: 40px; font-size: 0.9em; color: #666; text-align: center; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Privacy Policy for TubeFetch</h1>
                <p>Last Updated: April 27, 2026</p>
                
                <p>TubeFetch ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use the TubeFetch Chrome extension and our associated backend services.</p>

                <h2>1. Information We Collect</h2>
                <p><strong>Video URLs:</strong> When you use the extension, we collect the URL of the YouTube video you are viewing to retrieve its metadata and available download formats.</p>
                <p><strong>Cookies:</strong> To provide access to high-quality formats and ensure successful downloads, the extension securely passes YouTube authentication cookies from your browser to our backend. These cookies are used transiently and are not stored permanently.</p>
                <p><strong>Session Identifiers:</strong> We use random, non-personally identifiable session IDs to manage the temporary cache of video information during your active session.</p>

                <h2>2. How We Use Your Information</h2>
                <p>We use the collected information solely to:</p>
                <ul>
                    <li>Retrieve video metadata (title, thumbnail, available resolutions).</li>
                    <li>Facilitate the streaming and downloading of video files to your device.</li>
                    <li>Improve the performance and reliability of our service.</li>
                </ul>

                <h2>3. Data Storage and Security</h2>
                <p>We do not store your video history, personal information, or cookies on our servers. All video processing is performed in real-time, and cached metadata is periodically cleared. We implement standard security measures to protect data during transmission.</p>

                <h2>4. Data Sharing</h2>
                <p>We do not sell, trade, or otherwise transfer your information to third parties. We do not use trackers or include third-party advertisements in our extension.</p>

                <h2>5. Changes to This Policy</h2>
                <p>We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.</p>

                <div class="footer">
                    &copy; 2026 TubeFetch. All rights reserved.
                </div>
            </div>
        </body>
        </html>
    `);
});

// ── 404 Catch-all (for debugging) ──────────────────────────────────────────
app.use((req, res) => {
    console.warn(`[404] ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Endpoint not found', method: req.method, url: req.url });
});

app.listen(PORT, () => {
    console.log(`✅ OmniFetch backend running on http://localhost:${PORT}`);
});
