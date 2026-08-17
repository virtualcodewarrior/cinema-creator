// Local vs API classification for the model pickers.
// A model is "local" when it runs on the self-hosted backend instead of a
// third-party API:
//   - sd.cpp engine models (deno/storage/models.ts LOCAL_MODEL_CATALOG), or
//   - built-in self-hosted tools (provider === 'self-hosted').
// Every other catalog entry is a 3rd-party API model (API key required).

import * as models from './models.js';

const ALL_LISTS = [
  models.t2iModels,
  models.t2vModels,
  models.i2iModels,
  models.i2vModels,
  models.v2vModels,
  models.lipsyncModels,
  models.recastModels,
  models.audioModels,
];

// Provider lookup by id across every studio catalog (some pickers, e.g. the
// Layers upscaler, use their own local lists without provider fields).
const providerById = new Map();
for (const list of ALL_LISTS) {
  for (const m of list) {
    if (m.provider) providerById.set(m.id, m.provider);
  }
}

// sd.cpp local model ids — keep in sync with deno/storage/models.ts
// (LOCAL_MODEL_CATALOG).
export const LOCAL_MODEL_IDS = new Set([
  'z-image-turbo',
  'z-image-base',
  'dreamshaper-8',
  'realistic-vision-v51',
  'anything-v5',
  'stable-diffusion-xl-base',
]);

export function modelIsLocal(model) {
  if (!model || !model.id) return false;
  if (LOCAL_MODEL_IDS.has(model.id)) return true;
  const provider = model.provider ?? providerById.get(model.id);
  return provider === 'self-hosted';
}

export function modelOrigin(model) {
  return modelIsLocal(model) ? 'local' : 'api';
}

export function matchesOrigin(model, origin) {
  return !origin || origin === 'all' || modelOrigin(model) === origin;
}
