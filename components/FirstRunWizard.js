'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'ai_cinema_api_key';
const DENO_BACKEND_URL = process.env.DENO_BACKEND_URL || 'http://localhost:8000';

export default function FirstRunWizard({ onComplete }) {
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [backendUrl, setBackendUrl] = useState(DENO_BACKEND_URL);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);
  const [selectedModels, setSelectedModels] = useState([]);
  const [models, setModels] = useState([]);

  // Test backend connection
  const testConnection = async () => {
    setTesting(true);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/health`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.ok) {
        setStep(2);
      } else {
        setError('Backend returned invalid response');
      }
    } catch (err) {
      setError(`Cannot connect to backend: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  // Fetch available models
  const fetchModels = async () => {
    if (!apiKey) return;
    try {
      const response = await fetch(`${backendUrl}/api/models`, {
        headers: { 'x-api-key': apiKey },
      });
      const data = await response.json();
      if (data.ok) {
        setModels(data.data);
        // Select all by default
        setSelectedModels(data.data.map(m => m.id));
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Toggle model selection
  const toggleModel = (modelId) => {
    setSelectedModels(prev =>
      prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  // Complete setup
  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, apiKey);
    if (onComplete) onComplete();
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-white/10 rounded-lg p-8 w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-2">Welcome to AI Cinema</h1>
        <p className="text-white/60 mb-6">Let's get you set up in a few quick steps.</p>

        {/* Step 1: Backend URL */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Step 1: Backend Connection</h2>
            <p className="text-sm text-white/60 mb-4">
              Enter the URL of your Deno backend server.
            </p>
            <input
              type="text"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder="http://localhost:8000"
              className="w-full bg-black border border-white/20 rounded px-3 py-2 text-white mb-4 focus:outline-none focus:border-white/40"
            />
            {error && (
              <div className="bg-red-900/20 border border-red-500/30 rounded p-3 mb-4 text-red-400 text-sm">
                {error}
              </div>
            )}
            <button
              onClick={testConnection}
              disabled={testing}
              className="w-full px-4 py-2 bg-white text-black rounded hover:bg-white/90 disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
        )}

        {/* Step 2: API Key */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Step 2: API Key</h2>
            <p className="text-sm text-white/60 mb-4">
              Enter your API key to authenticate with the backend.
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key..."
              className="w-full bg-black border border-white/20 rounded px-3 py-2 text-white mb-4 focus:outline-none focus:border-white/40"
            />
            {error && (
              <div className="bg-red-900/20 border border-red-500/30 rounded p-3 mb-4 text-red-400 text-sm">
                {error}
              </div>
            )}
            <button
              onClick={fetchModels}
              disabled={!apiKey}
              className="w-full px-4 py-2 bg-white text-black rounded hover:bg-white/90 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 3: Model Selection */}
        {step === 3 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Step 3: Select Models</h2>
            <p className="text-sm text-white/60 mb-4">
              Choose which models to download. You can always add more later.
            </p>
            <div className="space-y-2 mb-4 max-h-60 overflow-auto">
              {models.map((model) => (
                <label
                  key={model.id}
                  className="flex items-center gap-3 p-3 bg-black border border-white/10 rounded cursor-pointer hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={selectedModels.includes(model.id)}
                    onChange={() => toggleModel(model.id)}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{model.name}</p>
                    <p className="text-xs text-white/60">{model.sizeGB} GB</p>
                  </div>
                </label>
              ))}
            </div>
            <button
              onClick={handleComplete}
              className="w-full px-4 py-2 bg-white text-black rounded hover:bg-white/90"
            >
              Complete Setup
            </button>
          </div>
        )}

        {/* Progress indicator */}
        <div className="flex gap-2 mt-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded ${s <= step ? 'bg-white' : 'bg-white/20'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
