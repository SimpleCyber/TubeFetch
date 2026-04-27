// popup.js
document.addEventListener('DOMContentLoaded', function() {
  const videoInfo      = document.getElementById('video-info');
  const loading        = document.getElementById('loading');
  const error          = document.getElementById('error');
  const errorMessage   = document.getElementById('error-message');
  const thumbnail      = document.getElementById('thumbnail');
  const title          = document.getElementById('title');
  const downloadOptions = document.querySelector('.download-options');

  const BACKEND_URL = 'https://tubefetch-us1e.onrender.com';

  /**
   * Strips playlist/index params so the backend always gets a clean watch URL.
   * Avoids Windows cmd.exe treating & as a command separator inside yt-dlp calls.
   */
  function cleanYouTubeUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);

      // Handle youtu.be short links
      if (parsed.hostname === 'youtu.be') {
        const videoId = parsed.pathname.slice(1).split('/')[0];
        return `https://www.youtube.com/watch?v=${videoId}`;
      }

      // Handle youtube.com/watch?v=...
      const videoId = parsed.searchParams.get('v');
      if (!videoId) return rawUrl; // not a video URL — pass through
      return `https://www.youtube.com/watch?v=${videoId}`;
    } catch {
      return rawUrl;
    }
  }

  // Query the active tab to get the YouTube video URL
  chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
    const tab = tabs[0];
    if (tab.url && (tab.url.includes('youtube.com/watch') || tab.url.includes('youtu.be/'))) {
      loading.style.display = 'flex';
      videoInfo.style.display = 'none';
      error.style.display = 'none';

      const cleanUrl = cleanYouTubeUrl(tab.url);

      try {
        const response = await fetch(`${BACKEND_URL}/info?url=${encodeURIComponent(cleanUrl)}`);
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const detailMsg = errData.details || errData.error || `Status ${response.status}`;
          throw new Error(detailMsg);
        }

        const info = await response.json();
        if (info.error) throw new Error(info.error);

        loading.style.display = 'none';
        videoInfo.style.display = 'block';
        thumbnail.src = info.thumbnail;
        title.textContent = info.title;

        // Clear existing buttons
        downloadOptions.innerHTML = '';

        const formats = info.formats;

        // ── Pick the tiers we want to show ──────────────────────────────────
        // Tier helper: find best video format matching a height or label hint
        function findBestVideo(height, labelHints = []) {
          return formats.find(f =>
            f.has_video && 
            (f.height === height || labelHints.some(h => f.quality.toLowerCase().includes(h)))
          );
        }

        // We'll show: best 1080p, best 720p, best 480p, and audio.
        const tier1080 = findBestVideo(1080, ['1080']);
        const tier720  = findBestVideo(720, ['720']);
        const tier480  = findBestVideo(480, ['480']);
        
        // Fallback combined: highest-filesize format that has both streams
        const tierBestCombined = formats.find(f => f.has_video && f.has_audio);
        const bestAudio = formats.find(f => !f.has_video && f.has_audio);

        // Build the display list — dedup by format_id
        const seen = new Set();
        const displayTiers = [];
        // Priority order: 1080p, 720p, 480p, Best Combined, Audio
        for (const f of [tier1080, tier720, tier480, tierBestCombined, bestAudio]) {
          if (f && !seen.has(f.format_id)) {
            seen.add(f.format_id);
            displayTiers.push(f);
          }
        }
        if (displayTiers.length === 0) displayTiers.push(...formats.slice(0, 3));

        // ── Quality meta for styling ─────────────────────────────────────────
        function getQualityMeta(fmt) {
          if (!fmt.has_video) return { dataQuality: 'audio',   badge: 'MP3', label: 'Audio Only', sub: 'High Quality' };
          
          const h = fmt.height;
          const q = fmt.quality.toLowerCase();
          
          if (h >= 1080 || q.includes('1080')) return { dataQuality: 'highest', badge: '1080p', label: 'Full HD',     sub: 'Best Quality' };
          if (h >= 720  || q.includes('720'))  return { dataQuality: '720p',    badge: '720p',  label: 'HD Quality',   sub: 'Sharp & Fast' };
          if (h >= 480  || q.includes('480'))  return { dataQuality: '480p',    badge: '480p',  label: 'Standard',     sub: 'Smaller File' };
          
          const size = fmt.filesize ? `${(fmt.filesize/1024/1024).toFixed(0)} MB` : fmt.quality;
          return { dataQuality: '480p', badge: fmt.height ? `${fmt.height}p` : fmt.extension.toUpperCase(), label: fmt.quality, sub: size };
        }

        displayTiers.forEach(format => {
          const { dataQuality, badge, label, sub } = getQualityMeta(format);
          const safeFilename = `${info.title.replace(/[\\/:*?"<>|]/g, '_')}.${format.extension}`;

          const button = document.createElement('button');
          button.className = 'download-button';
          button.dataset.quality = dataQuality;
          if (dataQuality === 'audio') button.style.gridColumn = 'span 2';

          button.innerHTML = `
            <span class="quality-badge">${badge}</span>
            <svg class="download-icon" viewBox="0 0 24 24">
              <path d="M12 15.575L16.95 10.625L15.8875 9.5625L12.75 12.7V4.5H11.25V12.7L8.1125 9.5625L7.05 10.625L12 15.575ZM6 19.5C5.45 19.5 4.97917 19.3042 4.5875 18.9125C4.19583 18.5208 4 18.05 4 17.5V15H5.5V17.5C5.5 17.7167 5.57917 17.8958 5.7375 18.0375C5.89583 18.1792 6.075 18.25 6.275 18.25H17.725C17.925 18.25 18.1042 18.1792 18.2625 18.0375C18.4208 17.8958 18.5 17.7167 18.5 17.5V15H20V17.5C20 18.05 19.8042 18.5208 19.4125 18.9125C19.0208 19.3042 18.55 19.5 18 19.5H6Z"/>
            </svg>
            <span class="quality-label">${label}</span>
            <span class="format-label">${sub}</span>
          `;

          button.addEventListener('click', async () => {
            const originalContent = button.innerHTML;
            button.disabled = true;
            button.innerHTML = `
              <span class="quality-label" style="display:flex;align-items:center;gap:6px">
                <span style="width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;display:inline-block;animation:spin 0.8s linear infinite"></span>
                Downloading…
              </span>`;

            try {
              // Use the backend /download streaming endpoint so yt-dlp injects
              // the required auth headers — bare CDN URLs fail in Chrome downloads.
              const downloadEndpoint =
                `${BACKEND_URL}/download` +
                `?url=${encodeURIComponent(cleanUrl)}` +
                `&format=${format.format_id}` +
                `&filename=${encodeURIComponent(safeFilename)}`;

              chrome.downloads.download(
                { url: downloadEndpoint, filename: safeFilename },
                (dlId) => {
                  if (chrome.runtime.lastError) {
                    alert(`Download failed: ${chrome.runtime.lastError.message}`);
                  }
                }
              );
            } catch (err) {
              console.error('Download failed:', err);
              alert(`Download failed: ${err.message}`);
            } finally {
              setTimeout(() => {
                button.disabled = false;
                button.innerHTML = originalContent;
              }, 1500);
            }
          });

          downloadOptions.appendChild(button);
        });

      } catch (err) {
        loading.style.display = 'none';
        error.style.display = 'flex';
        
        let displayError = err.message;
        
        // Try to extract more details if it's a server error
        if (err.message.includes('Server responded')) {
           try {
             // In a real scenario we'd need to catch the response object earlier to call .json()
             // But for now, we'll just suggest checking the backend logs or provide a more helpful hint.
             displayError = `Server Error: ${err.message}. Check backend logs for yt-dlp issues.`;
           } catch(e) {}
        }
        
        errorMessage.textContent = err.message.includes('fetch')
          ? 'Cannot reach backend. Is the server running?'
          : displayError;
        console.error(err);
      }
    } else {
      error.style.display = 'flex';
      errorMessage.textContent = 'Please open a YouTube video first.';
    }
  });

  // ── Theme Toggle ──────────────────────────────────────────────────────────
  const themeToggle = document.getElementById('theme-toggle');
  const sunIcon  = `<svg viewBox="0 0 24 24"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5s5-2.24 5-5s-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0c-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0c-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0c.39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41c-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>`;
  const moonIcon = `<svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9s9-4.03 9-9c0-.46-.04-.92-.1-1.36c-.98 1.37-2.58 2.26-4.4 2.26c-2.98 0-5.4-2.42-5.4-5.4c0-1.81.89-3.42 2.26-4.4c-.44-.06-.9-.1-1.36-.1z"/></svg>`;

  function setTheme(isDark) {
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
    themeToggle.innerHTML = isDark ? moonIcon : sunIcon;
    chrome.storage.sync.set({ isDarkMode: isDark });
  }

  chrome.storage.sync.get(['isDarkMode'], function(result) {
    if (result.isDarkMode !== undefined) {
      setTheme(result.isDarkMode);
    } else {
      setTheme(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
    }
  });

  themeToggle.addEventListener('click', () => {
    setTheme(document.body.getAttribute('data-theme') !== 'dark');
  });
});