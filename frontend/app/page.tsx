"use client";

import { useState, useEffect } from 'react';
import { FiDownload, FiArrowRight, FiChrome, FiSettings, FiUser, FiPlay, FiInfo, FiServer, FiCheckCircle } from 'react-icons/fi';
import Link from 'next/link';

const REMOTE_BACKEND = 'https://tubefetch-us1e.onrender.com';
const LOCAL_BACKEND = 'http://localhost:4000';
const BACKEND_URL = LOCAL_BACKEND; // Switched to local for your current setup

interface Format {
  format_id: string;
  extension: string;
  height: number;
  filesize: number;
  quality: string;
  has_video: boolean;
  has_audio: boolean;
}

interface VideoInfo {
  title: string;
  thumbnail: string;
  formats: Format[];
  duration?: string;
  source_url?: string;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLocal, setIsLocal] = useState(false);
  const [selectedFormatId, setSelectedFormatId] = useState<string>('');
  const [embedUrl, setEmbedUrl] = useState('https://www.youtube.com/embed/BK4HfFVMyUY?si=k-IDwynCYBudAv3p');

  const getYoutubeVideoId = (url: string) => {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname.includes('youtu.be')) return parsedUrl.pathname.slice(1);
      if (parsedUrl.searchParams.get('v')) return parsedUrl.searchParams.get('v');
      if (parsedUrl.pathname.includes('/embed/')) return parsedUrl.pathname.split('/embed/')[1];
      return null;
    } catch {
      return null;
    }
  };

  const fetchVideoInfo = async (inputUrl: string) => {
    if (!inputUrl || !inputUrl.startsWith('http')) return;
    setLoading(true);
    setError(null);
    
    const currentBackend = isLocal ? LOCAL_BACKEND : REMOTE_BACKEND;
    
    try {
      const response = await fetch(`${currentBackend}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || 'Failed to fetch video info');
      }

      const data = await response.json();
      setVideoInfo(data);
      
      const bestFormat = data.formats.find((f: Format) => f.height === 1080) || data.formats[0];
      if (bestFormat) setSelectedFormatId(bestFormat.format_id);

      if (inputUrl.includes('youtube.com') || inputUrl.includes('youtu.be')) {
        const videoId = getYoutubeVideoId(inputUrl);
        if (videoId) setEmbedUrl(`https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Could not connect to the backend. Please check the URL or try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    setError(null);
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (url.length > 10 && !videoInfo) {
        fetchVideoInfo(url);
      }
    }, 800);

    return () => clearTimeout(delayDebounceFn);
  }, [url]);

  const handleDownload = async (formatId?: string) => {
    const fid = formatId || selectedFormatId;
    if (!url || !fid || !videoInfo) return;
    setLoading(true);

    const format = videoInfo.formats.find(f => f.format_id === fid);
    const safeFilename = `${videoInfo.title.replace(/[\\/:*?"<>|]/g, '_')}.${format?.extension || 'mp4'}`;
    
    const downloadUrl = `${BACKEND_URL}/download?url=${encodeURIComponent(url)}&format=${fid}&filename=${encodeURIComponent(safeFilename)}`;
    
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', safeFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      {/* Header */}
      <header className="max-w-[1400px] mx-auto px-6 py-8 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="relative w-6 h-6 flex items-center justify-center">
            <div className="absolute left-0 w-3 h-5 bg-red-600 rounded-sm rotate-12"></div>
            <div className="absolute right-0 w-3 h-6 bg-slate-900 rounded-sm -rotate-12"></div>
          </div>
          <span className="text-2xl font-black tracking-[0.15em] text-slate-900 ml-2 uppercase">OMNIFETCH</span>
        </div>
        
        <nav className="hidden md:flex items-center gap-8">
          <a href="#tools" className="text-sm font-bold text-slate-500 hover:text-slate-900 flex items-center gap-2 transition-colors">
            <FiSettings className="w-4 h-4" /> Tools
          </a>
          <Link href="/privacy" className="text-sm font-bold text-slate-500 hover:text-slate-900 flex items-center gap-2 transition-colors">
            <FiUser className="w-4 h-4" /> Privacy Policy
          </Link>
          <button className="bg-[#1C2127] hover:bg-black text-white text-sm font-semibold px-6 py-2.5 rounded-full transition-colors flex items-center gap-2">
            <FiChrome className="w-4 h-4" /> Add to Chrome
          </button>
        </nav>
      </header>

      {/* Main Content Grid */}
      <main className="max-w-[1400px] mx-auto px-6 py-6 md:py-12 grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-10 lg:gap-16 items-start">
        
        {/* Left Column - Controls */}
        <div className="flex flex-col w-full">
          <h1 className="text-[22px] font-bold text-slate-800 mb-8 tracking-tight flex items-center gap-3">
            Video Downloader
            {videoInfo && <FiCheckCircle className="text-green-500 w-5 h-5 animate-bounce" />}
          </h1>
          
          <div className="flex flex-col gap-5 mb-8">
            <div className="border border-slate-200/80 rounded-2xl p-4 bg-white shadow-sm flex flex-col gap-1 focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-400 transition-all">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Video URL</label>
              <div className="flex items-center gap-2">
                <input 
                  type="url"
                  value={url}
                  onChange={handleUrlChange}
                  placeholder="Paste your link here..."
                  className="w-full text-sm text-slate-700 focus:outline-none bg-transparent font-medium placeholder-slate-300"
                />
                {loading && <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex flex-col gap-2 animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center gap-3">
                  <FiInfo className="text-red-500 w-4 h-4 flex-shrink-0" />
                  <span className="text-[11px] font-bold text-red-600 leading-tight">{error}</span>
                </div>
                {!isLocal && (
                  <button 
                    onClick={() => { setIsLocal(true); setError(null); }}
                    className="text-[10px] font-bold bg-white text-slate-600 border border-slate-200 py-1.5 px-3 rounded-lg hover:bg-slate-50 transition-colors self-start"
                  >
                    Switch to Local Backend (Port 4000)
                  </button>
                )}
              </div>
            )}

            {/* Quick Options */}
            {videoInfo && (
              <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide px-1">Select Quality to Download</label>
                <div className="grid grid-cols-2 gap-3">
                  {videoInfo.formats.slice(0, 4).map((f) => (
                    <button
                      key={f.format_id}
                      onClick={() => handleDownload(f.format_id)}
                      className={`p-3 rounded-xl border text-left transition-all group relative overflow-hidden ${
                        selectedFormatId === f.format_id 
                        ? 'border-red-500 bg-red-50/50 shadow-md' 
                        : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5 relative z-10">
                        <span className={`text-[13px] font-bold ${selectedFormatId === f.format_id ? 'text-red-600' : 'text-slate-800'}`}>
                          {f.quality}
                        </span>
                        <span className="text-[10px] font-medium text-slate-400 uppercase">
                          {f.extension} • {f.filesize ? (f.filesize / (1024 * 1024)).toFixed(1) + ' MB' : 'N/A'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Conditional Resolution Display */}
          {videoInfo && (
            <div className="mt-2 mb-8 px-1 animate-in fade-in duration-700">
              <div className="flex justify-between items-end mb-1">
                <div className="flex flex-col">
                  <div className="text-[12px] font-bold text-slate-800 leading-tight">Estimated</div>
                  <div className="text-[12px] font-bold text-slate-800 leading-tight">Video Resolution</div>
                  <div className="text-[11px] font-medium text-slate-400 mt-1">
                    {videoInfo.formats.find(f => f.format_id === selectedFormatId)?.height || 'HD'}p Quality
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-[32px] font-semibold text-slate-800 tracking-tight leading-none mb-1">
                    {videoInfo.formats.find(f => f.format_id === selectedFormatId)?.height || '1080'}
                    <span className="text-[16px] font-medium text-slate-600 ml-0.5">p</span>
                  </div>
                  <div className="text-[11px] font-medium text-green-500 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Available
                  </div>
                </div>
              </div>
            </div>
          )}

          <button 
            onClick={() => handleDownload()}
            disabled={loading || !videoInfo}
            className={`w-full font-bold py-4 px-6 rounded-[1.25rem] flex justify-between items-center transition-all disabled:opacity-70 disabled:cursor-not-allowed mb-4 shadow-lg ${
              videoInfo 
              ? 'bg-gradient-to-r from-red-600 to-red-700 text-white hover:scale-[1.02] active:scale-95' 
              : 'bg-[#20252A] text-slate-400'
            }`}
          >
            <span className="text-[15px]">{videoInfo ? 'Download Now' : 'Download Video'}</span>
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <FiArrowRight className="w-5 h-5" />
            )}
          </button>
          
          <button className="w-full bg-white border-2 border-slate-100 hover:border-slate-200 text-slate-800 font-bold py-4 px-6 rounded-[1.25rem] flex justify-between items-center transition-all group">
            <span className="text-[15px]">Chrome Extension</span>
            <div className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-colors">
               <FiChrome className="w-3.5 h-3.5" />
            </div>
          </button>
        </div>

        {/* Right Column - Media */}
        <div className="bg-[#F8F9FB] rounded-[2.5rem] p-4 pb-6 flex flex-col relative w-full h-full shadow-[inset_0_2px_20px_rgba(0,0,0,0.02)]">
          {/* Video Container */}
          <div className="w-full aspect-[16/10] rounded-[2rem] overflow-hidden bg-black relative mb-6 shadow-2xl border-[4px] border-white group">
             <iframe 
                width="100%" 
                height="100%" 
                src={embedUrl} 
                title="YouTube video player" 
                frameBorder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="w-full h-full object-cover"
              ></iframe>
          </div>

          {/* Metadata */}
          <div className="flex justify-between items-start px-4 mb-8">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-black text-slate-900 line-clamp-1">{videoInfo?.title || "OmniFetch: The Ultimate Downloader"}</span>
              <span className="text-[12px] font-bold text-slate-400">Source: {videoInfo ? new URL(url).hostname : 'YouTube'}</span>
            </div>
            <div className="flex flex-col gap-0.5 text-right">
              <span className="text-[13px] text-red-500 font-bold tracking-tight">{videoInfo ? 'DATA LOADED' : 'DEMO MODE'}</span>
              <span className="text-[12px] font-bold text-slate-900 uppercase">Length: {videoInfo?.duration || "1:20"}</span>
            </div>
          </div>
          
          {/* Progress / Status Bar */}
          <div className="px-4 mb-10 flex flex-col gap-2">
            <div className="flex items-center gap-3">
               <div className="flex items-center gap-[2px]">
                 <div className={`w-1 h-3 rounded-sm transition-colors ${videoInfo ? 'bg-green-400 animate-pulse' : 'bg-slate-400'}`}></div>
                 <div className={`w-1 h-3 rounded-sm transition-colors ${videoInfo ? 'bg-green-400' : 'bg-slate-400'}`}></div>
               </div>
               <div className="flex-1 h-1 bg-slate-200/50 rounded-full overflow-hidden relative">
                 <div className={`absolute top-0 left-0 h-full transition-all duration-[2s] ease-out ${videoInfo ? 'w-full bg-green-500' : 'w-[25%] bg-red-500'}`}></div>
               </div>
            </div>
            <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <span>{videoInfo ? 'Completed' : 'Processing...'}</span>
              <span>{videoInfo ? '100%' : '25%'}</span>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}