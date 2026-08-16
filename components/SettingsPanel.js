'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'ai_cinema_api_key';
const DENO_BACKEND_URL = process.env.DENO_BACKEND_URL || 'http://localhost:8000';

export default function SettingsPanel({ onDismiss }) {
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState([]);
  const [downloading, setDownloading] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [diskUsage, setDiskUsage] = useState(0);

  // Load API key
  useEffect(() => {
    const key = localStorage.getItem(STORAGE_KEY);
    if (key) setApiKey(key);
  }, []);

  // Fetch models
  const fetchModels = useCallback(async () => {
    if (!apiKey) return;
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${DENO_BACKEND_URL}/api/models`, {
        headers: { 'x-api-key': apiKey },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.ok) {
        setModels(data.data);
        // Calculate disk usage
        const totalSize = data.data.reduce((sum, m) => sum + (m.state === 'downloaded' ? m.sizeGB : 0), 0);
        setDiskUsage(totalSize);
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
    fetchModels();
  }, [fetchModels]);

  // Download model
  const handleDownload = async (modelId) => {
    if (!apiKey || downloading[modelId]) return;
    try {
      setDownloading(prev => ({ ...prev, [modelId]: true }));
      setError(null);
      const response = await fetch(`${DENO_BACKEND_URL}/api/models/${modelId}/download`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error);
      } else {
        // Poll for download status
        pollDownloadStatus(modelId);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(prev => ({ ...prev, [modelId]: false }));
    }
  };

  // Poll download status
  const pollDownloadStatus = async (modelId) => {
    const poll = async () => {
      if (!apiKey) return;
      try {
        const response = await fetch(`${DENO_BACKEND_URL}/api/download/status?modelId=${modelId}`, {
          headers: { 'x-api-key': apiKey },
        });
        const data = await response.json();
        if (data.ok && !data.data.downloading) {
          fetchModels(); // Refresh model list
        } else {
          setTimeout(poll, 2000);
        }
      } catch {
        fetchModels(); // Refresh anyway
      }
    };
    poll();
  };

  // Delete model
  const handleDelete = async (modelId) => {
    if (!apiKey) return;
    if (!confirm('Delete this model? This cannot be undone.')) return;
    try {
      // Note: We need to add a delete endpoint to the Deno backend
      // For now, show a message
      setError('Model deletion not yet implemented. Delete manually from ~/.ai-cinema/models/');
    } catch (err) {
      setError(err.message);
    }
  };

  // Download auxiliary file
  const handleAuxDownload = async (auxKey) => {
    if (!apiKey || downloading[auxKey]) return;
    try {
      setDownloading(prev => ({ ...prev, [auxKey]: true }));
      setError(null);
      const response = await fetch(`${DENO_BACKEND_URL}/api/aux/${auxKey}/download`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
      });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error);
      } else {
        pollAuxDownloadStatus(auxKey);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(prev => ({ ...prev, [auxKey]: false }));
    }
  };

  const pollAuxDownloadStatus = async (auxKey) => {
    const poll = async () => {
      if (!apiKey) return;
      try {
        const response = await fetch(`${DENO_BACKEND_URL}/api/download/status?auxKey=${auxKey}`, {
          headers: { 'x-api-key': apiKey },
        });
        const data = await response.json();
        if (data.ok && !data.data.downloading) {
          fetchModels();
        } else {
          setTimeout(poll, 2000);
        }
      } catch {
        fetchModels();
      }
    };
    poll();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-white/10 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Settings</h2>
          <button onClick={onDismiss} className="text-white/60 hover:text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* API Key */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-white/80 mb-2">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter API key..."
            className="w-full bg-black border border-white/20 rounded px-3 py-2 text-white focus:outline-none focus:border-white/40"
          />
          <p className="text-xs text-white/40 mt-1">
            Stored locally in your browser. Used to authenticate with the Deno backend.
          </p>
        </div>

        {/* Model Management */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Local Models</h3>
          <p className="text-sm text-white/60 mb-4">
            Disk usage: {diskUsage.toFixed(1)} GB
          </p>

          {loading && <div className="text-white/60">Loading models...</div>}
          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded p-3 mb-4 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {models.map((model) => (
              <div
                key={model.id}
                className="bg-black border border-white/10 rounded p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium">{model.name}</h4>
                    <p className="text-sm text-white/60 mt-1">
                      {model.description || model.type} · {model.sizeGB} GB
                    </p>
                    {model.state === 'downloaded' && (
                      <span className="inline-block mt-2 text-xs bg-green-900/30 text-green-400 px-2 py-0.5 rounded">
                        Downloaded
                      </span>
                    )}
                    {model.state === 'partial' && (
                      <span className="inline-block mt-2 text-xs bg-yellow-900/30 text-yellow-400 px-2 py-0.5 rounded">
                        Partial Download
                      </span>
                    )}
                    {model.state === 'not-downloaded' && (
                      <span className="inline-block mt-2 text-xs bg-gray-800 text-white/60 px-2 py-0.5 rounded">
                        Not Downloaded
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {model.state !== 'downloaded' ? (
                      <button
                        onClick={() => handleDownload(model.id)}
                        disabled={downloading[model.id]}
                        className="px-3 py-1.5 bg-white text-black rounded text-sm hover:bg-white/90 disabled:opacity-50"
                      >
                        {downloading[model.id] ? 'Downloading...' : 'Download'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDelete(model.id)}
                        className="px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-500/30 rounded text-sm hover:bg-red-900/50"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Auxiliary Files */}
          <div className="mt-6">
            <h4 className="text-sm font-medium text-white/80 mb-3">Auxiliary Files (for Z-Image models)</h4>
            <div className="space-y-2">
              <AuxFileItem
                name="Qwen3-4B Text Encoder"
                size="2.4 GB"
                auxKey="llm"
                downloading={downloading['llm']}
                onDownload={() => handleAuxDownload('llm')}
              />
              <AuxFileItem
                name="FLUX VAE"
                size="335 MB"
                auxKey="vae"
                downloading={downloading['vae']}
                onDownload={() => handleAuxDownload('vae')}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuxFileItem({ name, size, auxKey, downloading, onDownload }) {
  const [state, setState] = useState('not-downloaded');

  useEffect(() => {
    // Check if file exists by trying to fetch it
    // This is a simplification - in reality we'd need a status endpoint
    const check = async () => {
      // For now, just show download button
    };
    check();
  }, []);

  return (
    <div className="flex items-center justify-between bg-black border border-white/10 rounded p-3">
      <div>
        <p className="text-sm">{name}</p>
        <p className="text-xs text-white/60">{size}</p>
      </div>
      <button
        onClick={onDownload}
        disabled={downloading}
        className="px-3 py-1.5 bg-white text-black rounded text-sm hover:bg-white/90 disabled:opacity-50"
      >
        {downloading ? 'Downloading...' : 'Download'}
      </button>
    </div>
  );
}
