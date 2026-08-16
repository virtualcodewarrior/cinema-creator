// Backend client for self-hosted AI Cinema.
// Calls the Deno backend directly via same-origin requests.
// Maintains the same function signatures for compatibility with studio components.

import { getModelById, getVideoModelById, getI2IModelById, getI2VModelById, getV2VModelById, getRecastModelById, getLipSyncModelById, getAudioModelById } from './models.js';

function getBaseUrl() {
    if (typeof window !== 'undefined') {
        return window.location.origin;
    }
    return 'http://localhost:8000';
}

function notifyAuthRequired(status, detail) {
    if (typeof window === 'undefined') return;
    if (status !== 401 && status !== 403) return;
    window.dispatchEvent(new CustomEvent('backend:auth-required', { detail: { status, message: detail } }));
}

async function pollForResult(requestId, key, maxAttempts = 900, interval = 2000) {
    const baseUrl = getBaseUrl();
    const pollUrl = `${baseUrl}/api/v1/predictions/${requestId}/result`;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, interval));
        try {
            const response = await fetch(pollUrl, {
                headers: { 'Content-Type': 'application/json', 'x-api-key': key }
            });
            if (!response.ok) {
                const errText = await response.text();
                if (response.status >= 500) continue;
                notifyAuthRequired(response.status, errText);
                throw new Error(`Poll Failed: ${response.status} - ${errText.slice(0, 100)}`);
            }
            const data = await response.json();
            const status = data.status?.toLowerCase();
            if (status === 'completed' || status === 'succeeded' || status === 'success') return data;
            if (status === 'failed' || status === 'error') throw new Error(`Generation failed: ${data.error || 'Unknown error'}`);
        } catch (error) {
            if (attempt === maxAttempts) throw error;
        }
    }
    throw new Error('Generation timed out after polling.');
}

async function submitAndPoll(endpoint, payload, key, onRequestId, maxAttempts = 60) {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/api/v1/${endpoint}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errText = await response.text();
        notifyAuthRequired(response.status, errText);
        throw new Error(`API Request Failed: ${response.status} ${response.statusText} - ${errText.slice(0, 100)}`);
    }
    const submitData = await response.json();
    const requestId = submitData.request_id || submitData.id;
    if (!requestId) return submitData;
    if (onRequestId) onRequestId(requestId);
    const result = await pollForResult(requestId, key, maxAttempts);
    const outputUrl = result.outputs?.[0] || result.url || result.output?.url;
    return { ...result, url: outputUrl };
}

// ─── Generation functions ───────────────────────────────────────────────────

export async function generateImage(apiKey, params) {
    const modelInfo = getModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const payload = { prompt: params.prompt };
    if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
    if (params.resolution) payload.resolution = params.resolution;
    if (params.quality) payload.quality = params.quality;
    if (params.image_url) {
        payload.image_url = params.image_url;
        payload.strength = params.strength || 0.6;
    } else if (params.images_list) {
        payload.images_list = params.images_list;
    } else {
        payload.image_url = null;
    }
    if (params.seed && params.seed !== -1) payload.seed = params.seed;
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 60);
}

export async function generateI2I(apiKey, params) {
    const modelInfo = getI2IModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const payload = {};
    if (params.prompt) payload.prompt = params.prompt;
    const imageField = modelInfo?.imageField || 'image_url';
    const imagesList = params.images_list?.length > 0 ? params.images_list : (params.image_url ? [params.image_url] : null);
    if (imagesList) {
        if (imageField === 'images_list') payload.images_list = imagesList;
        else payload[imageField] = imagesList[0];
    }
    if (modelInfo?.swapField && params.swap_url) {
        payload[modelInfo.swapField] = params.swap_url;
    }
    if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
    if (params.resolution) payload.resolution = params.resolution;
    if (params.quality) payload.quality = params.quality;
    if (modelInfo?.inputs?.name) {
        payload.name = params.name || modelInfo.inputs.name.default;
    }
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 60);
}

export async function decomposeLayers(apiKey, params) {
    const endpoint = 'bytedance-seedream-5.0-pro-layer';
    const payload = {
        image_url: params.image_url,
        prompt: params.prompt || '',
        resolution: params.resolution || 'auto',
        output_format: params.output_format || 'png'
    };
    const result = await submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 300);
    const rawImages = result.images || result.output?.images || result.outputs || (result.url ? [result.url] : []);
    const images = Array.isArray(rawImages) ? rawImages : [rawImages];
    return { ...result, images };
}

export async function generateVideo(apiKey, params) {
    const modelInfo = getVideoModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const payload = {};
    if (params.prompt) payload.prompt = params.prompt;
    if (params.request_id) payload.request_id = params.request_id;
    if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
    if (params.duration) payload.duration = params.duration;
    if (params.resolution) payload.resolution = params.resolution;
    if (params.quality) payload.quality = params.quality;
    if (params.mode) payload.mode = params.mode;
    if (params.image_url) payload.image_url = params.image_url;
    if (params.images_list?.length > 0) payload.images_list = params.images_list;
    if (params.videos_list?.length > 0) payload.videos_list = params.videos_list;
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900);
}

export async function generateI2V(apiKey, params) {
    const modelInfo = getI2VModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const payload = {};
    if (params.prompt) payload.prompt = params.prompt;
    const imageField = modelInfo?.imageField || 'image_url';
    const imageInput = modelInfo?.inputs?.[imageField];
    const imageUrls = params.images_list?.length > 0
        ? params.images_list
        : (params.image_url ? [params.image_url] : []);
    if (imageUrls.length > 0) {
        if (imageInput?.type === 'array' || imageField === 'images_list') {
            payload[imageField] = imageUrls;
        } else {
            payload[imageField] = imageUrls[0];
        }
    }
    const lastImageField = modelInfo?.lastImageField;
    if (lastImageField && params.last_image) {
        if (lastImageField === 'images_list') {
            if (!payload.images_list) payload.images_list = [];
            if (payload.images_list.indexOf(params.last_image) === -1) {
                payload.images_list.push(params.last_image);
            }
        } else {
            payload[lastImageField] = params.last_image;
        }
    }
    if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
    if (params.duration) payload.duration = params.duration;
    if (params.resolution) payload.resolution = params.resolution;
    if (params.quality) payload.quality = params.quality;
    if (params.mode) payload.mode = params.mode;
    if (modelInfo?.inputs?.name) {
        payload.name = params.name || modelInfo.inputs.name.default;
    }
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900);
}

export async function generateMarketingStudioAd(apiKey, params) {
    const endpoint = params.resolution === '1080p' ? 'sd-2-vip-omni-reference-1080p' : 'seedance-2-vip-omni-reference';
    const payload = {
        prompt: params.prompt,
        aspect_ratio: params.aspect_ratio || '16:9',
        duration: params.duration || 5,
        images_list: params.images_list || [],
        video_files: params.video_files || []
    };
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900);
}

export async function processV2V(apiKey, params) {
    const modelInfo = getV2VModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const videoField = modelInfo?.videoField || 'video_url';
    const payload = { [videoField]: params.video_url };
    if (modelInfo?.imageField && params.image_url) {
        payload[modelInfo.imageField] = params.image_url;
    }
    if (modelInfo?.hasPrompt && params.prompt) {
        payload.prompt = params.prompt;
    }
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900);
}

export async function processRecast(apiKey, params) {
    const modelInfo = getRecastModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const videoField = modelInfo?.videoField || 'video_url';
    const payload = { [videoField]: params.video_url };
    if (modelInfo?.imageField && params.image_url) {
        payload[modelInfo.imageField] = params.image_url;
    }
    if (modelInfo?.hasPrompt && params.prompt) {
        payload.prompt = params.prompt;
    }
    if (params.aspect_ratio) {
        payload.aspect_ratio = params.aspect_ratio;
    }
    if (params.character_orientation) {
        payload.character_orientation = params.character_orientation;
    }
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900);
}

export async function processLipSync(apiKey, params) {
    const modelInfo = getLipSyncModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const payload = {};
    if (params.audio_url) payload.audio_url = params.audio_url;
    if (params.image_url) payload.image_url = params.image_url;
    if (params.video_url) payload.video_url = params.video_url;
    if (modelInfo?.hasPrompt) payload.prompt = params.prompt || '';
    if (params.resolution) payload.resolution = params.resolution;
    if (params.seed !== undefined && params.seed !== -1) payload.seed = params.seed;
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900);
}

export async function generateAudio(apiKey, params) {
    const modelId = params._modelId || params.model;
    const modelInfo = getAudioModelById(modelId);
    const endpoint = modelInfo?.endpoint || modelId;
    const payload = {};
    const skipKeys = ['_modelId', 'onRequestId'];
    for (const key in params) {
        if (!skipKeys.includes(key) && params[key] !== undefined && params[key] !== null) {
            payload[key] = params[key];
        }
    }
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900);
}

// ─── File upload ────────────────────────────────────────────────────────────

export function uploadFile(apiKey, file, onProgress) {
    return new Promise((resolve, reject) => {
        const baseUrl = getBaseUrl();
        const url = `${baseUrl}/api/v1/upload_file`;
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('x-api-key', apiKey);

        if (onProgress) {
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    onProgress(percentComplete);
                }
            };
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    const fileUrl = data.url || data.file_url || data.data?.url;
                    if (!fileUrl) {
                        reject(new Error('No URL returned from file upload'));
                    } else {
                        resolve(fileUrl);
                    }
                } catch (e) {
                    reject(new Error('Failed to parse upload response'));
                }
            } else {
                let detail = xhr.statusText;
                try {
                    const errObj = JSON.parse(xhr.responseText);
                    detail = errObj.detail || detail;
                } catch (e) {
                    // fallback to statusText
                }
                notifyAuthRequired(xhr.status, detail);
                reject(new Error(`File upload failed: ${xhr.status} - ${detail}`));
            }
        };

        xhr.onerror = () => reject(new Error('Network error during file upload'));
        xhr.send(formData);
    });
}

// ─── Account & history ──────────────────────────────────────────────────────

export async function getUserBalance(apiKey) {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/v1/account/balance`, {
        headers: { 'x-api-key': apiKey }
    });
    if (!response.ok) {
        throw new Error(`Failed to get balance: ${response.status}`);
    }
    return response.json();
}

export async function getHistory(apiKey, { cursor, limit = 50 } = {}) {
    const baseUrl = getBaseUrl();
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    params.set('limit', String(limit));
    const response = await fetch(`${baseUrl}/api/v1/history?${params}`, {
        headers: { 'x-api-key': apiKey }
    });
    if (!response.ok) {
        throw new Error(`Failed to get history: ${response.status}`);
    }
    return response.json();
}

export async function deleteMedia(apiKey, requestId) {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/v1/predictions/${requestId}/media`, {
        method: 'DELETE',
        headers: { 'x-api-key': apiKey }
    });
    if (!response.ok) {
        throw new Error(`Failed to delete media: ${response.status}`);
    }
    return response.json();
}

// ─── Re-export model getters (used by studio components) ────────────────────

export {
    getModelById,
    getVideoModelById,
     getI2IModelById,
     getI2VModelById,
     getV2VModelById,
     getRecastModelById,
     getLipSyncModelById,
     getAudioModelById,
 };

// ─── App interests ──────────────────────────────────────────────────────────

export async function registerAppInterest(apiKey, appName) {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/app/interest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ app_name: appName })
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to register interest: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

export async function getAppInterests(apiKey) {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/app/interests`, {
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch interests: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

// ─── Clipping ───────────────────────────────────────────────────────────────

export async function runClipping(apiKey, params) {
    const payload = {
        video_url: params.video_url,
        num_highlights: params.num_highlights || 3,
        aspect_ratio: params.aspect_ratio || "9:16",
        return_coordinates_only: !!params.return_coordinates_only
    };
    return submitAndPoll("ai-clipping", payload, apiKey, params.onRequestId, 900);
}

// ─── Motion Graphics ────────────────────────────────────────────────────────

export async function runMotionGraphics(apiKey, params) {
    const payload = {
        prompt: params.prompt,
        aspect_ratio: params.aspect_ratio || "16:9",
        duration_seconds: params.duration_seconds || 6,
    };
    return submitAndPoll("motion-graphics", payload, apiKey, params.onRequestId, 900);
}

export async function runMotionGraphicsEdit(apiKey, params) {
    const payload = {
        request_id: params.request_id,
        edit_prompt: params.edit_prompt,
        aspect_ratio: params.aspect_ratio || "16:9",
        duration_seconds: params.duration_seconds || 6,
    };
    return submitAndPoll("motion-graphics-edit", payload, apiKey, params.onRequestId, 900);
}

