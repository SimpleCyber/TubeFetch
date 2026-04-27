
// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchVideoInfo') {
    fetchVideoInfo(request.url)
      .then(info => sendResponse({ success: true, info }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'downloadVideo') {
    downloadVideo(request.videoUrl, request.format, request.title)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function fetchVideoInfo(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    
    // Extract video info from YouTube page
    const ytInitialData = JSON.parse(html.split('ytInitialData = ')[1].split(';</script>')[0]);
    const ytInitialPlayerResponse = JSON.parse(html.split('ytInitialPlayerResponse = ')[1].split(';</script>')[0]);
    
    const videoDetails = ytInitialPlayerResponse.videoDetails;
    const streamingData = ytInitialPlayerResponse.streamingData;
    
    return {
      title: videoDetails.title,
      author: videoDetails.author,
      thumbnail: `https://i.ytimg.com/vi/${videoDetails.videoId}/maxresdefault.jpg`,
      formats: processFormats(streamingData.formats, streamingData.adaptiveFormats)
    };
  } catch (error) {
    throw new Error('Failed to fetch video information');
  }
}

function processFormats(formats, adaptiveFormats) {
  const processedFormats = [];
  
  // Process combined formats (video+audio)
  formats.forEach(format => {
    if (format.qualityLabel) {
      processedFormats.push({
        label: format.qualityLabel,
        url: format.url,
        mimeType: format.mimeType,
        hasAudio: true,
        hasVideo: true
      });
    }
  });
  
  // Process adaptive formats (separate video and audio)
  adaptiveFormats.forEach(format => {
    if (format.mimeType.includes('audio')) {
      processedFormats.push({
        label: 'Audio Only',
        url: format.url,
        mimeType: format.mimeType,
        hasAudio: true,
        hasVideo: false
      });
    }
  });
  
  return processedFormats;
}

async function downloadVideo(url, format, title) {
  try {
    const sanitizedTitle = title.replace(/[^\w\s-]/g, '');
    const filename = `${sanitizedTitle}_${format}.mp4`;
    
    await chrome.downloads.download({
      url: url,
      filename: filename,
      conflictAction: 'uniquify'
    });
    
    return { filename };
  } catch (error) {
    throw new Error('Download failed');
  }
}
