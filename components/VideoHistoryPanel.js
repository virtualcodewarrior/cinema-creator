'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'ai_cinema_api_key';
const DENO_BACKEND_URL = process.env.DENO_BACKEND_URL || 'http://localhost:8000';

export default function VideoHistoryPanel({ onDismiss }) {
  const [apiKey, setApiKey] = useState('');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);

  // Load API key
  useEffect(() => {
    const key = localStorage.getItem(STORAGE_KEY);
    if (key) setApiKey(key);
  }, []);

  // Fetch video history
  const fetchHistory = useCallback(async () => {
    if (!apiKey) return;
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${DENO_BACKEND_URL}/api/v1/history?limit=50`, {
        headers: { 'x-api-key': apiKey },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.ok) {
        // Filter for video entries (those with video URLs or video-related models)
        const videoEntries = data.data.items.filter(
          (item) => item.url?.endsWith('.mp4') || item.url?.endsWith('.webm') || item.model?.includes('video')
        );
        setVideos(videoEntries);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Delete video entry
  const handleDelete = async (entryId) => {
    if (!apiKey) return;
    if (!confirm('Delete this history entry?')) return;
    try {
      const response = await fetch(`${DENO_BACKEND_URL}/api/v1/predictions/${entryId}/media`, {
        method: 'DELETE',
        headers: { 'x-api-key': apiKey },
      });
      const data = await response.json();
      if (data.ok) {
        fetchHistory();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Download video
  const handleDownload = (url, filename) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'video.mp4';
    a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-white/10 rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Video History</h2>
          <button onClick={onDismiss} className="text-white/60 hover:text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {loading && <div className="text-white/60">Loading videos...</div>}
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded p-3 mb-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {videos.length === 0 && !loading && (
          <div className="text-white/60 text-center py-12">
            No video history yet. Generate some videos to see them here.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {videos.map((video) => (
            <div
              key={video.id}
              className="bg-black border border-white/10 rounded overflow-hidden"
            >
              {video.url && (
                <div className="aspect-video bg-black">
                  <video
                    src={video.url}
                    className="w-full h-full object-contain"
                    controls
                    onClick={() => setSelectedVideo(video)}
                  />
                </div>
              )}
              <div className="p-3">
                <p className="text-sm font-medium truncate">{video.prompt || 'No prompt'}</p>
                <p className="text-xs text-white/60 mt-1">
                  {video.modelName || video.model} · {new Date(video.createdAt).toLocaleString()}
                </p>
                <div className="flex gap-2 mt-2">
                  {video.url && (
                    <button
                      onClick={() => handleDownload(video.url, `${video.id}.mp4`)}
                      className="px-2 py-1 bg-white/10 text-white rounded text-xs hover:bg-white/20"
                    >
                      Download
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(video.id)}
                    className="px-2 py-1 bg-red-900/30 text-red-400 rounded text-xs hover:bg-red-900/50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
