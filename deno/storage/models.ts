// Model catalog and state management for the Deno backend.
// Defines available local models and tracks their download status.

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  type: "sd1" | "sd2" | "sdxl" | "z-image" | "flux";
  filename: string;
  sizeGB: number;
  aspectRatios: string[];
  defaultWidth: number;
  defaultHeight: number;
  defaultSteps: number;
  defaultGuidance: number;
  sampler?: string;
  tags?: string[];
  requiresAuxiliary?: boolean;
  downloadUrl?: string;
  state: "not-downloaded" | "partial" | "downloaded";
  path?: string;
  auxiliaryStatus?: {
    llm: "not-downloaded" | "downloaded";
    vae: "not-downloaded" | "downloaded";
  };
}

export const LOCAL_MODEL_CATALOG: Omit<ModelInfo, "state" | "path" | "auxiliaryStatus">[] = [
  // ── Z-Image (Tongyi-MAI) ────────────────────────────────────────────────
  {
    id: "z-image-turbo",
    name: "Z-Image Turbo",
    description: "Ultra-fast 8-step generation. Requires text encoder + VAE (~2.7 GB extra).",
    type: "z-image",
    filename: "z_image_turbo-Q4_K.gguf",
    sizeGB: 3.4,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    defaultWidth: 1024,
    defaultHeight: 1024,
    defaultSteps: 8,
    defaultGuidance: 1.0,
    sampler: "euler",
    tags: ["turbo", "fast", "featured"],
    requiresAuxiliary: true,
    downloadUrl: "https://huggingface.co/leejet/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q4_K.gguf",
  },
  {
    id: "z-image-base",
    name: "Z-Image Base",
    description: "Full-quality model — higher detail, 50-step generation.",
    type: "z-image",
    filename: "z-image-Q4_K_M.gguf",
    sizeGB: 3.5,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    defaultWidth: 1024,
    defaultHeight: 1024,
    defaultSteps: 50,
    defaultGuidance: 7.5,
    sampler: "euler",
    tags: ["high-quality", "detailed"],
    requiresAuxiliary: true,
    downloadUrl: "https://huggingface.co/unsloth/Z-Image-GGUF/resolve/main/z-image-Q4_K_M.gguf",
  },
  // ── SD 1.5 models ───────────────────────────────────────────────────────
  {
    id: "dreamshaper-8",
    name: "Dreamshaper 8",
    description: "Versatile SD 1.5 model — great for portraits, landscapes, and artistic styles.",
    type: "sd1",
    filename: "DreamShaper_8_pruned.safetensors",
    sizeGB: 2.1,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    defaultWidth: 512,
    defaultHeight: 512,
    defaultSteps: 20,
    defaultGuidance: 7.5,
    sampler: "euler_a",
    tags: ["photorealistic", "artistic", "versatile"],
    downloadUrl: "https://huggingface.co/Lykon/DreamShaper/resolve/main/DreamShaper_8_pruned.safetensors",
  },
  {
    id: "realistic-vision-v51",
    name: "Realistic Vision v5.1",
    description: "Highly photorealistic people and scenes, based on SD 1.5.",
    type: "sd1",
    filename: "realisticVisionV51_v51VAE.safetensors",
    sizeGB: 2.1,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    defaultWidth: 512,
    defaultHeight: 768,
    defaultSteps: 25,
    defaultGuidance: 7,
    sampler: "euler_a",
    tags: ["photorealistic", "portraits", "people"],
    downloadUrl:
      "https://huggingface.co/SG161222/Realistic_Vision_V5.1_noVAE/resolve/main/Realistic_Vision_V5.1_fp16-no-ema.safetensors",
  },
  {
    id: "anything-v5",
    name: "Anything v5",
    description: "High quality anime and illustration style image generation.",
    type: "sd1",
    filename: "Anything-v5.0-PRT.safetensors",
    sizeGB: 2.1,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    defaultWidth: 512,
    defaultHeight: 768,
    defaultSteps: 20,
    defaultGuidance: 7,
    sampler: "euler_a",
    tags: ["anime", "illustration", "artistic"],
    downloadUrl: "https://huggingface.co/Yntec/AnythingV5/resolve/main/Anything-v5.0-PRT.safetensors",
  },
  // ── SDXL ───────────────────────────────────────────────────────────────
  {
    id: "stable-diffusion-xl-base",
    name: "SDXL Base 1.0",
    description: "Official Stable Diffusion XL base model — higher resolution, excellent quality.",
    type: "sdxl",
    filename: "sd_xl_base_1.0.safetensors",
    sizeGB: 6.9,
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    defaultWidth: 1024,
    defaultHeight: 1024,
    defaultSteps: 30,
    defaultGuidance: 7.5,
    sampler: "dpmpp2m",
    tags: ["sdxl", "high-quality", "versatile"],
    downloadUrl:
      "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors",
  },
];

export const ZIMAGE_AUXILIARY = {
  llm: {
    id: "__llm__",
    filename: "Qwen3-4B-Instruct-2507-UD-Q4_K_XL.gguf",
    displayName: "Qwen3-4B Text Encoder",
    sizeGB: 2.4,
    downloadUrl:
      "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-UD-Q4_K_XL.gguf",
  },
  vae: {
    id: "__vae__",
    filename: "ae.safetensors",
    displayName: "FLUX VAE",
    sizeGB: 0.33,
    downloadUrl: "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors",
  },
};

/**
 * Get model info by ID.
 */
export function getModelById(id: string): Omit<ModelInfo, "state" | "path" | "auxiliaryStatus"> | undefined {
  return LOCAL_MODEL_CATALOG.find((m) => m.id === id);
}

/**
 * Get all models with their current state on disk.
 */
export function getModelsWithState(modelsDir: string): ModelInfo[] {
  return LOCAL_MODEL_CATALOG.map((model) => ({
    ...model,
    state: getModelState(model.filename, modelsDir),
    path: `${modelsDir}/${model.filename}`,
    ...(model.requiresAuxiliary ? { auxiliaryStatus: getAuxiliaryStatus(modelsDir) } : {}),
  }));
}

function getModelState(filename: string, modelsDir: string): ModelInfo["state"] {
  const filePath = `${modelsDir}/${filename}`;
  const partPath = `${filePath}.part`;

  try {
    Deno.statSync(filePath);
    return "downloaded";
  } catch {
    try {
      Deno.statSync(partPath);
      return "partial";
    } catch {
      return "not-downloaded";
    }
  }
}

function getAuxiliaryStatus(modelsDir: string): ModelInfo["auxiliaryStatus"] {
  const llmPath = `${modelsDir}/${ZIMAGE_AUXILIARY.llm.filename}`;
  const vaePath = `${modelsDir}/${ZIMAGE_AUXILIARY.vae.filename}`;
  return {
    llm: _fileExists(llmPath) ? "downloaded" : "not-downloaded",
    vae: _fileExists(vaePath) ? "downloaded" : "not-downloaded",
  };
}

function _fileExists(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}
