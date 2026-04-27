// content.js
// This script runs on YouTube pages
function getVideoInfo() {
    const videoElement = document.querySelector('video');
    const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer');
    const thumbnailUrl = document.querySelector('link[rel="shortlinkUrl"]')?.href;
    
    if (videoElement && titleElement) {
      return {
        title: titleElement.textContent.trim(),
        thumbnail: `https://img.youtube.com/vi/${getVideoId()}/maxresdefault.jpg`,
        url: window.location.href
      };
    }
    return null;
  }
  
  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }
  
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getVideoInfo") {
      sendResponse({videoInfo: getVideoInfo()});
    } else if (request.action === "downloadVideo") {
      // Logic moved to popup.js and backend
      console.log(`Download requested for quality: ${request.quality}`);
    }
    return true;
  });