
// background.js - OmniFetch Service Worker
const BACKEND_URL = 'https://tubefetch-us1e.onrender.com';

/**
 * Configure Side Panel behavior
 */
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

/**
 * Generates or retrieves a persistent sessionId.
 */
async function getSessionId() {
    return new Promise(resolve => {
        chrome.storage.local.get(['sessionId'], (result) => {
            if (result.sessionId) {
                resolve(result.sessionId);
            } else {
                const newId = Math.random().toString(36).substring(2, 15);
                chrome.storage.local.set({ sessionId: newId }, () => resolve(newId));
            }
        });
    });
}

/**
 * Fetches cookies for specific domains and formats them in Netscape format.
 */
async function getPlatformCookies(url) {
    const domains = [".youtube.com", ".google.com"];
    if (url.includes('instagram.com')) domains.push(".instagram.com");
    if (url.includes('pinterest.com')) domains.push(".pinterest.com");
    if (url.includes('facebook.com')) domains.push(".facebook.com");
    if (url.includes('x.com') || url.includes('twitter.com')) {
        domains.push(".x.com");
        domains.push(".twitter.com");
    }
    if (url.includes('linkedin.com')) domains.push(".linkedin.com");
    if (url.includes('vimeo.com')) domains.push(".vimeo.com");
    if (url.includes('tiktok.com')) domains.push(".tiktok.com");
    if (url.includes('twitch.tv')) domains.push(".twitch.tv");
    if (url.includes('dailymotion.com')) domains.push(".dailymotion.com");
    if (url.includes('rumble.com')) domains.push(".rumble.com");
    if (url.includes('bitchute.com')) domains.push(".bitchute.com");
    if (url.includes('mixcloud.com')) domains.push(".mixcloud.com");

    let allCookies = [];
    for (const domain of domains) {
        const cookies = await new Promise(resolve => chrome.cookies.getAll({ domain }, resolve));
        allCookies = allCookies.concat(cookies);
    }
    
    // De-duplicate
    const cookieMap = new Map();
    allCookies.forEach(c => {
        const key = `${c.name}:${c.domain}:${c.path}`;
        if (!cookieMap.has(key)) cookieMap.set(key, c);
    });
    
    const uniqueCookies = Array.from(cookieMap.values());
    let netscape = "# Netscape HTTP Cookie File\n\n";
    
    uniqueCookies.forEach(c => {
        let domain = c.domain;
        const includeSub = domain.startsWith('.') ? "TRUE" : "FALSE";
        const path = c.path;
        const secure = c.secure ? "TRUE" : "FALSE";
        const expiry = c.expirationDate ? Math.floor(c.expirationDate) : 0;
        const name = c.name;
        const value = c.value;
        netscape += `${domain}\t${includeSub}\t${path}\t${secure}\t${expiry}\t${name}\t${value}\n`;
    });
    
    return netscape;
}

/**
 * Triggers a pre-load of video info in the backend.
 */
async function preloadVideoInfo(url) {
    console.log(`[OmniFetch] Pre-loading info for: ${url}`);
    try {
        const [sessionId, cookies] = await Promise.all([getSessionId(), getPlatformCookies(url)]);
        
        const response = await fetch(`${BACKEND_URL}/info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                url: url, 
                cookies: cookies,
                sessionId: sessionId 
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`[OmniFetch] Pre-load successful for: ${data.title}`);
        }
    } catch (err) {
        console.error(`[OmniFetch] Pre-load error:`, err.message);
    }
}

// Listen for tab updates to detect media pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        const url = tab.url;
        const isSupported = url.includes('youtube.com/watch') || 
                           url.includes('youtube.com/shorts') ||
                           url.includes('instagram.com/reels') ||
                           url.includes('instagram.com/p/') ||
                           url.includes('pinterest.com/pin/');
        
        if (isSupported) {
            preloadVideoInfo(url);
        }
    }
});
