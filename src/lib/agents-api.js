// Shared fetch helper for the agents surface. Replaces the package's shared
// axios instance + the request interceptor in AgentChatClient.jsx: every /api
// request carries x-api-key from localStorage (written by <app-settings>).
// All paths are relative; Vite proxies /api to the Deno backend.
import { appStore } from './store.js';

export function getApiKey() {
  return localStorage.getItem('ai_cinema_api_key') || appStore.getState().apiKey || '';
}

export function apiHeaders(extra = {}) {
  const h = { ...extra };
  const key = getApiKey();
  if (key) h['x-api-key'] = key;
  return h;
}

// Signed-URL uploads need upload-progress events, which fetch() doesn't offer.
// Mirrors the axios onUploadProgress behavior of the React version (no auth
// header on the signed URL — same as the old interceptor, which only tagged
// /api/* and relative URLs).
export function xhrUpload(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded * 100) / e.total));
      });
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.status);
      else reject(new Error('HTTP ' + xhr.status));
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(formData);
  });
}

export async function apiFetch(path, { method = 'GET', body, headers = {} } = {}) {
  const h = apiHeaders(headers);
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body != null) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers: h, body: payload });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const detail = data && (data.detail || data.message);
    const err = new Error(typeof detail === 'string' ? detail : 'HTTP ' + res.status);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { status: res.status, data };
}
