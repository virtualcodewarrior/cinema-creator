'use client';

import { useState, useEffect } from 'react';
import ImageStudio from '@/packages/studio/src/components/ImageStudio';
import VideoStudio from '@/packages/studio/src/components/VideoStudio';
import CinemaStudio from '@/packages/studio/src/components/CinemaStudio';
import LipSyncStudio from '@/packages/studio/src/components/LipSyncStudio';
import WorkflowStudio from '@/packages/studio/src/components/WorkflowStudio';
import AgentStudio from '@/packages/studio/src/components/AgentStudio';
import AppsStudio from '@/packages/studio/src/components/AppsStudio';
import AudioStudio from '@/packages/studio/src/components/AudioStudio';
import MarketingStudio from '@/packages/studio/src/components/MarketingStudio';
import RecastStudio from '@/packages/studio/src/components/RecastStudio';
import VibeMotionStudio from '@/packages/studio/src/components/VibeMotionStudio';
import ClippingStudio from '@/packages/studio/src/components/ClippingStudio';
import LayersStudio from '@/packages/studio/src/components/LayersStudio';
import DesignAgentStudio from '@/packages/studio/src/components/DesignAgentStudio';
import AiInfluencerStudio from '@/packages/studio/src/components/AiInfluencerStudio';
import SettingsPanel from '@/components/SettingsPanel';

const STUDIO_NAV = [
  { label: 'Image', path: '/studio/image', icon: '🎨' },
  { label: 'Video', path: '/studio/video', icon: '🎬' },
  { label: 'Cinema', path: '/studio/cinema', icon: '🎥' },
  { label: 'Lip Sync', path: '/studio/lipsync', icon: '👄' },
  { label: 'Workflow', path: '/studio/workflow', icon: '🔗' },
  { label: 'Agents', path: '/studio/agents', icon: '🤖' },
  { label: 'Apps', path: '/studio/apps', icon: '📦' },
  { label: 'Audio', path: '/studio/audio', icon: '🎵' },
  { label: 'Marketing', path: '/studio/marketing', icon: '📢' },
  { label: 'Recast', path: '/studio/recast', icon: '🎭' },
  { label: 'Motion', path: '/studio/vibemotion', icon: '💃' },
  { label: 'Clipping', path: '/studio/clipping', icon: '✂️' },
  { label: 'Layers', path: '/studio/layers', icon: '🖼️' },
  { label: 'Design', path: '/studio/design', icon: '✏️' },
  { label: 'Influencer', path: '/studio/influencer', icon: '⭐' },
];

export default function AppShell() {
  const [currentStudio, setCurrentStudio] = useState('image');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/\/studio\/(\w+)/);
    if (match) {
      setCurrentStudio(match[1]);
    } else if (path.startsWith('/studio') || path === '/agents' || path === '/workflow') {
      setCurrentStudio('image');
    }
  }, []);

  const handleNav = (path) => {
    window.history.pushState({}, '', path);
    const match = path.match(/\/studio\/(\w+)/);
    if (match) {
      setCurrentStudio(match[1]);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const match = path.match(/\/studio\/(\w+)/);
      if (match) {
        setCurrentStudio(match[1]);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const renderStudio = () => {
    switch (currentStudio) {
      case 'image': return <ImageStudio />;
      case 'video': return <VideoStudio />;
      case 'cinema': return <CinemaStudio />;
      case 'lipsync': return <LipSyncStudio />;
      case 'workflow': return <WorkflowStudio />;
      case 'agents': return <AgentStudio />;
      case 'apps': return <AppsStudio />;
      case 'audio': return <AudioStudio />;
      case 'marketing': return <MarketingStudio />;
      case 'recast': return <RecastStudio />;
      case 'vibemotion': return <VibeMotionStudio />;
      case 'clipping': return <ClippingStudio />;
      case 'layers': return <LayersStudio />;
      case 'design': return <DesignAgentStudio />;
      case 'influencer': return <AiInfluencerStudio />;
      default: return <ImageStudio />;
    }
  };

  return (
    <div className="h-screen w-full flex bg-[#0a0a0f] text-white">
      {/* Sidebar */}
      <div className="w-56 min-w-[140px] bg-[#12121a] border-r border-white/5 flex flex-col">
        <div className="p-4 border-b border-white/5">
          <h1 className="text-lg font-bold">AI Cinema</h1>
          <p className="text-xs text-white/40 mt-1">Self-Hosted Studio</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {STUDIO_NAV.map((item) => (
            <button
              key={item.path}
              onClick={() => handleNav(item.path)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${
                currentStudio === item.path.replace('/studio/', '')
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-2 border-t border-white/5">
          <button
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-white/5 hover:text-white transition-colors"
          >
            <span>⚙️</span>
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {renderStudio()}
      </div>

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowSettings(false)}>
          <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-md mx-4 border border-white/10" onClick={(e) => e.stopPropagation()}>
            <SettingsPanel onDismiss={() => setShowSettings(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
