// sidepanel.js
document.addEventListener('DOMContentLoaded', function() {
  const elements = {
    urlInput: document.getElementById('url-input'),
    fetchBtn: document.getElementById('fetch-btn'),
    statusBanner: document.getElementById('status-banner'),
    platformText: document.getElementById('platform-text'),
    mainContent: document.getElementById('main-content'),
    emptyState: document.getElementById('empty-state'),
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    errorMessage: document.getElementById('error-message'),
    videoCard: document.getElementById('video-card'),
    thumbnail: document.getElementById('thumbnail'),
    title: document.getElementById('title'),
    downloadGrid: document.getElementById('download-grid'),
    themeToggle: document.getElementById('theme-toggle')
  };

  // const BACKEND_URL = 'https://tubefetch-us1e.onrender.com';
  const BACKEND_URL = 'http://localhost:4000';
  
  let sessionId;

  // Initialize Session
  chrome.storage.local.get(['sessionId'], (result) => {
    sessionId = result.sessionId || Math.random().toString(36).substring(2, 15);
    if (!result.sessionId) chrome.storage.local.set({ sessionId });
  });

  // Theme Logic
  function setTheme(isDark) {
    document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
    chrome.storage.sync.set({ isDarkMode: isDark });
  }

  chrome.storage.sync.get(['isDarkMode'], (res) => {
    const isDark = res.isDarkMode !== undefined ? res.isDarkMode : window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(isDark);
  });

  elements.themeToggle.addEventListener('click', () => {
    setTheme(document.body.getAttribute('data-theme') !== 'dark');
  });

  /**
   * Detects platform from URL
   */
  function detectPlatform(url) {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.includes('youtube.com/shorts')) return { name: 'YouTube Shorts', color: '#ff0000', domains: ['.youtube.com', '.google.com'] };
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return { name: 'YouTube', color: '#ff0000', domains: ['.youtube.com', '.google.com'] };
    if (lower.includes('instagram.com')) return { name: 'Instagram', color: '#e1306c', domains: ['.instagram.com'] };
    if (lower.includes('pinterest.com') || lower.includes('pinimg.com')) return { name: 'Pinterest', color: '#bd081c', domains: ['.pinterest.com'] };
    if (lower.includes('facebook.com') || lower.includes('fb.watch')) return { name: 'Facebook', color: '#1877f2', domains: ['.facebook.com'] };
    if (lower.includes('twitter.com')) return { name: 'Twitter', color: '#000000', domains: ['.twitter.com'] };
    if (lower.includes('vimeo.com')) return { name: 'Vimeo', color: '#1ab7ea', domains: ['.vimeo.com'] };
    if (lower.includes('twitch.tv')) return { name: 'Twitch', color: '#9146ff', domains: ['.twitch.tv'] };
    if (lower.includes('reddit.com')) return { name: 'Reddit', color: '#ff4500', domains: ['.reddit.com'] };
    if (lower.includes('soundcloud.com')) return { name: 'SoundCloud', color: '#ff5500', domains: ['.soundcloud.com'] };
    if (lower.includes('dailymotion.com')) return { name: 'DailyMotion', color: '#0066dc', domains: ['.dailymotion.com'] };
    if (lower.includes('rumble.com')) return { name: 'Rumble', color: '#85c742', domains: ['.rumble.com'] };
    if (lower.includes('bitchute.com')) return { name: 'BitChute', color: '#c31e21', domains: ['.bitchute.com'] };
    if (lower.includes('mixcloud.com')) return { name: 'Mixcloud', color: '#52aad8', domains: ['.mixcloud.com'] };
    return { name: 'Universal', color: '#6366f1', domains: [] };
  }

  /**
   * Generic Cookie Extractor
   */
  async function getCookies(domains) {
    if (!domains || domains.length === 0) return null;
    let allCookies = [];
    for (const domain of domains) {
      const cookies = await new Promise(resolve => chrome.cookies.getAll({ domain }, resolve));
      allCookies = allCookies.concat(cookies);
    }
    
    let netscape = "# Netscape HTTP Cookie File\n\n";
    allCookies.forEach(c => {
      const includeSub = c.domain.startsWith('.') ? "TRUE" : "FALSE";
      const expiry = c.expirationDate ? Math.floor(c.expirationDate) : 0;
      netscape += `${c.domain}\t${includeSub}\t${c.path}\t${c.secure ? "TRUE" : "FALSE"}\t${expiry}\t${c.name}\t${c.value}\n`;
    });
    return netscape;
  }

  /**
   * Main Fetch Logic
   */
  async function fetchVideoInfo(url) {
    if (!url) return;

    // UI Feedback
    elements.emptyState.style.display = 'none';
    elements.videoCard.style.display = 'none';
    elements.errorState.style.display = 'none';
    elements.loadingState.style.display = 'flex';
    
    const platform = detectPlatform(url);
    if (platform) {
      elements.statusBanner.style.display = 'flex';
      elements.platformText.textContent = `Platform: ${platform.name}`;
      document.querySelector('.status-dot').style.background = platform.color;
      document.querySelector('.status-dot').style.boxShadow = `0 0 8px ${platform.color}`;
    }

    try {
      const cookies = await getCookies(platform?.domains);
      
      const response = await fetch(`${BACKEND_URL}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, cookies, sessionId })
      });

      if (!response.ok) throw new Error('Failed to fetch video data. Check URL or Backend.');

      const info = await response.json();
      if (info.error) throw new Error(info.error);

      displayVideo(info, url);
    } catch (err) {
      showError(err.message);
    } finally {
      elements.loadingState.style.display = 'none';
    }
  }

  function displayVideo(info, originalUrl) {
    elements.loadingState.style.display = 'none';
    elements.videoCard.style.display = 'block';
    elements.thumbnail.src = info.thumbnail;
    elements.title.textContent = info.title;
    elements.downloadGrid.innerHTML = '';

    // Filter and display useful formats
    const formats = info.formats || [];
    
    // Logic to pick a few good formats
    const bestVideo = formats.find(f => f.has_video && f.height >= 720) || formats.find(f => f.has_video);
    const bestAudio = formats.find(f => !f.has_video && f.has_audio);
    const images    = formats.filter(f => f.is_image);

    const toShow = [];
    if (bestVideo) toShow.push({ ...bestVideo, label: 'Video', sub: bestVideo.quality });
    if (bestAudio) toShow.push({ ...bestAudio, label: 'Audio', sub: 'MP3/M4A' });
    
    // Add up to 2 high-res images if available
    images.slice(0, 2).forEach(img => {
      toShow.push({ ...img, label: 'Image', sub: img.quality });
    });

    // If no specific formats found, show first 4
    if (toShow.length === 0) toShow.push(...formats.slice(0, 4));

    toShow.forEach(fmt => {
      const btn = document.createElement('button');
      btn.className = 'download-btn';
      
      const badgeText = fmt.is_image ? 'IMG' : (fmt.height ? fmt.height + 'p' : 'HQ');
      
      btn.innerHTML = `
        <span class="btn-badge">${badgeText}</span>
        <svg class="download-icon" viewBox="0 0 24 24"><path d="M12 15.575L16.95 10.625L15.8875 9.5625L12.75 12.7V4.5H11.25V12.7L8.1125 9.5625L7.05 10.625L12 15.575ZM6 19.5C5.45 19.5 4.97917 19.3042 4.5875 18.9125C4.19583 18.5208 4 18.05 4 17.5V15H5.5V17.5C5.5 17.7167 5.57917 17.8958 5.7375 18.0375C5.89583 18.1792 6.075 18.25 6.275 18.25H17.725C17.925 18.25 18.1042 18.1792 18.2625 18.0375C18.4208 17.8958 18.5 17.7167 18.5 17.5V15H20V17.5C20 18.05 19.8042 18.5208 19.4125 18.9125C19.0208 19.3042 18.55 19.5 18 19.5H6Z"/></svg>
        <span class="btn-label">${fmt.label || 'Download'}</span>
        <span class="btn-sub">${fmt.extension.toUpperCase()}</span>
        <div class="btn-progress"></div>
      `;

      btn.addEventListener('click', () => startDownload(originalUrl, fmt, info.title, btn));
      elements.downloadGrid.appendChild(btn);
    });
  }

  async function startDownload(url, format, title, btn) {
    const progress = btn.querySelector('.btn-progress');
    const label = btn.querySelector('.btn-label');
    const originalText = label.textContent;
    
    btn.style.pointerEvents = 'none';
    label.textContent = 'Preparing...';

    const safeFilename = `${title.replace(/[\\/:*?"<>|]/g, '_')}.${format.extension}`;
    const downloadUrl = `${BACKEND_URL}/download?url=${encodeURIComponent(url)}&format=${format.format_id}&filename=${encodeURIComponent(safeFilename)}&sessionId=${sessionId}`;

    chrome.downloads.download({ url: downloadUrl, filename: safeFilename }, (id) => {
      if (chrome.runtime.lastError) {
        showError(chrome.runtime.lastError.message);
        resetBtn();
        return;
      }

      const checkProgress = setInterval(() => {
        chrome.downloads.search({ id }, (items) => {
          if (items && items[0]) {
            const item = items[0];
            if (item.state === 'in_progress') {
              if (item.totalBytes > 0) {
                const percent = (item.bytesReceived / item.totalBytes) * 100;
                progress.style.width = `${percent}%`;
                label.textContent = `${Math.floor(percent)}%`;
              } else {
                progress.style.width = '50%';
                label.textContent = 'Streaming...';
              }
            } else {
              clearInterval(checkProgress);
              resetBtn();
            }
          }
        });
      }, 500);
    });

    function resetBtn() {
      btn.style.pointerEvents = 'auto';
      label.textContent = originalText;
      progress.style.width = '0%';
    }
  }

  function showError(msg) {
    elements.loadingState.style.display = 'none';
    elements.videoCard.style.display = 'none';
    elements.errorState.style.display = 'flex';
    elements.errorMessage.textContent = msg;
  }

  // Listen for manual fetch
  elements.fetchBtn.addEventListener('click', () => {
    const url = elements.urlInput.value.trim();
    if (url) fetchVideoInfo(url);
  });

  elements.urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') elements.fetchBtn.click();
  });

  // Listen for tab updates to auto-detect
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
      // Only auto-fetch if the side panel is visible and it's a known platform
      const platform = detectPlatform(changeInfo.url);
      if (platform && platform.name !== 'Universal') {
        fetchVideoInfo(changeInfo.url);
        elements.urlInput.value = changeInfo.url;
      }
    }
  });

  // Initial check
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.url) {
      const platform = detectPlatform(tabs[0].url);
      if (platform && platform.name !== 'Universal') {
        fetchVideoInfo(tabs[0].url);
        elements.urlInput.value = tabs[0].url;
      }
    }
  });

  /**
   * Supported Platforms List for Footer
   */
  const SUPPORTED_PLATFORMS = [
    { name: 'YouTube', url: 'https://www.youtube.com', color: '#ff0000', icon: '<path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>' },
    { name: 'Instagram', url: 'https://www.instagram.com', color: '#e1306c', icon: '<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>' },
    { name: 'Pinterest', url: 'https://www.pinterest.com', color: '#bd081c', icon: '<path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.966 1.406-5.966s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.925-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C24.02 5.367 18.637 0 12.017 0z"/>' },
    { name: 'Facebook', url: 'https://www.facebook.com', color: '#1877f2', icon: '<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>' },
    { name: 'Twitter', url: 'https://www.twitter.com', color: '#000000', icon: '<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>' },
    // { name: 'TikTok', url: 'https://www.tiktok.com', color: '#000000', icon: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.06-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.9-.32-1.98-.23-2.81.36-.54.38-.89.98-1.03 1.64-.13.47-.12.95 0 1.42.12.54.42 1.03.83 1.4.31.27.71.47 1.11.56.74.12 1.53-.12 2.1-.59.41-.34.69-.82.8-1.33.11-.46.11-.93.02-1.39V.02z"/>' },
    { name: 'Vimeo', url: 'https://vimeo.com', color: '#1ab7ea', icon: '<path d="M22.396 7.158c-.093 2.026-1.507 4.8-4.245 8.322-2.842 3.668-5.243 5.503-7.203 5.503-1.208 0-2.231-1.113-3.069-3.339-.558-2.046-1.116-4.093-1.674-6.139-.614-2.251-1.275-3.377-1.982-3.377-.156 0-.701.325-1.636.974l-.98-1.258c1.026-.902 2.043-1.805 3.053-2.709 1.404-1.189 2.459-1.821 3.162-1.902 1.657-.183 2.673.953 3.05 3.402.422 2.76.711 4.475.867 5.14.341 1.634.714 2.453 1.116 2.453.31 0 .843-.53 1.599-1.591.758-1.06 1.161-1.865 1.208-2.415.111-1.183-.332-1.776-1.33-1.776-.458 0-.931.104-1.42.314 1.341-4.389 3.896-6.525 7.662-6.41 2.784.088 4.148 1.83 4.09 5.228z"/>' },
    { name: 'Twitch', url: 'https://www.twitch.tv', color: '#9146ff', icon: '<path d="M11.571 4.714h1.715v5.143H11.571zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>' },
    { name: 'Rumble', url: 'https://rumble.com', color: '#85c742', icon: '<path d="M12 0c6.627 0 12 5.373 12 12s-5.373 12-12 12S0 18.627 0 12 5.373 0 12 0zm0 4.8c-3.976 0-7.2 3.224-7.2 7.2s3.224 7.2 7.2 7.2 7.2-3.224 7.2-7.2-3.224-7.2-7.2-7.2zm0 2.4c2.651 0 4.8 2.149 4.8 4.8S14.651 14.4 12 14.4s-4.8-2.149-4.8-4.8S9.349 7.2 12 7.2z"/>' },
    { name: 'Mixcloud', url: 'https://www.mixcloud.com', color: '#52aad8', icon: '<path d="M12 0a12 12 0 1 0 12 12A12 12 0 0 0 12 0zm0 18a6 6 0 1 1 6-6 6 6 0 0 1-6 6z"/>' },
    { name: 'LinkedIn', url: 'https://www.linkedin.com', color: '#0a66c2', icon: '<path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>' },
    { name: 'SoundCloud', url: 'https://soundcloud.com', color: '#ff5500', icon: '<path d="M11.5 14.125h.5V19.5h-.5V14.125zM12.5 13.5h.5V19.5h-.5V13.5zM13.5 12.5h.5V19.5h-.5V12.5zM14.5 11.5h.5V19.5h-.5V11.5zM15.5 12.5h.5V19.5h-.5V12.5zM16.5 11.5h.5V19.5h-.5V11.5zM17.5 12.5h.5V19.5h-.5V12.5zM18.5 11.5h.5V19.5h-.5V11.5zM19.5 10.5h.5V19.5h-.5V10.5zM20.5 11.5h.5V19.5h-.5V11.5zM21.5 12.5h.5V19.5h-.5V12.5zM22.5 13.5h.5V19.5h-.5V13.5zM23.5 14.5h.5V19.5h-.5V14.5zM10.5 15h.5V19.5h-.5V15zM9.5 16h.5V19.5h-.5V16zM8.5 17h.5V19.5h-.5V17zM7.5 16h.5V19.5h-.5V16zM6.5 17h.5V19.5h-.5V17zM5.5 16h.5V19.5h-.5V16zM4.5 17h.5V19.5h-.5V17zM3.5 18h.5V19.5h-.5V18zM2.5 17h.5V19.5h-.5V17zM1.5 18h.5V19.5h-.5V18zM0.5 19h.5V19.5h-.5V19zM12 4.5c4.142 0 7.5 3.358 7.5 7.5s-3.358 7.5-7.5 7.5-7.5-3.358-7.5-7.5 3.358-7.5 7.5-7.5z"/>' }
  ];

  function injectPlatforms() {
    const grid = document.getElementById('platforms-grid');
    if (!grid) return;

    SUPPORTED_PLATFORMS.forEach(p => {
      const item = document.createElement('a');
      item.href = p.url;
      item.target = '_blank';
      item.className = 'platform-item';
      item.title = `Visit ${p.name}`;
      
      item.innerHTML = `
        <div class="platform-icon" style="background-color: ${p.color}">
          <svg viewBox="0 0 24 24">${p.icon}</svg>
        </div>
        <span class="platform-name">${p.name}</span>
      `;
      grid.appendChild(item);
    });
  }

  injectPlatforms();
});
