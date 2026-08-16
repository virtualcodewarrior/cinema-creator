'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ImageStudio,
  VideoStudio,
  LipSyncStudio,
  AudioStudio,
} from 'studio';

const TABS = [
  {
    id: 'image',
    label: 'Image Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    )
  },
  {
    id: 'video',
    label: 'Video Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7"/>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </svg>
    )
  },
  {
    id: 'audio',
    label: 'Audio Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
    )
  },
  {
    id: 'lipsync',
    label: 'Lip Sync',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="22"/>
      </svg>
    )
  }
];

const STORAGE_KEY = 'ai_cinema_api_key';

export default function SelfHostedShell() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug || [];

  const getInitialTab = () => {
    const firstSegment = slug[0];
    if (firstSegment && TABS.find(t => t.id === firstSegment)) return firstSegment;
    return 'image';
  };

  const [apiKey, setApiKey] = useState(null);
  const [activeTab, setActiveTab] = useState(getInitialTab());
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  // Load API key from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHasMounted(true);
      const key = localStorage.getItem(STORAGE_KEY);
      if (key) {
        setApiKey(key);
      } else {
        setShowApiKeyModal(true);
      }
    }
  }, []);

  const handleApiKeySave = (key) => {
    localStorage.setItem(STORAGE_KEY, key);
    setApiKey(key);
    setShowApiKeyModal(false);
  };

  const handleApiKeyClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setApiKey(null);
    setShowApiKeyModal(true);
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    router.push(`/studio/${tabId}`);
  };

  if (!hasMounted) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <div className="text-white/60">Loading...</div>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <ApiKeyModal
          onSave={handleApiKeySave}
          onClose={() => {}}
        />
      </div>
    );
  }

  const renderStudio = () => {
    switch (activeTab) {
      case 'image':
        return <ImageStudio apiKey={apiKey} />;
      case 'video':
        return <VideoStudio apiKey={apiKey} />;
      case 'audio':
        return <AudioStudio apiKey={apiKey} />;
      case 'lipsync':
        return <LipSyncStudio apiKey={apiKey} />;
      default:
        return <ImageStudio apiKey={apiKey} />;
    }
  };

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-black/50">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold">AI Cinema</h1>
          <span className="text-xs text-white/40">Self-Hosted</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleApiKeyClear}
            className="text-xs text-white/60 hover:text-white px-2 py-1 rounded"
          >
            Reset API Key
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="h-10 border-b border-white/10 flex items-center px-2 gap-1 bg-black/30 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white/10 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Studio Content */}
      <main className="flex-1 overflow-auto">
        {renderStudio()}
      </main>

      {/* API Key Modal */}
      {showApiKeyModal && (
        <ApiKeyModal
          onSave={handleApiKeySave}
          onClose={() => {}}
        />
      )}
    </div>
  );
}

function ApiKeyModal({ onSave, onClose }) {
  const [key, setKey] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (key.trim()) {
      onSave(key.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-white/10 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">API Key Required</h2>
        <p className="text-white/60 text-sm mb-4">
          Enter your Deno backend API key. This is stored locally in your browser.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter API key..."
            className="w-full bg-black border border-white/20 rounded px-3 py-2 text-white mb-4 focus:outline-none focus:border-white/40"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-white/60 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-white text-black rounded hover:bg-white/90"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
