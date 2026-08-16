// Model-specific argument building for sd.cpp.
// Translates frontend parameters into sd-cli command-line arguments.

export interface ModelConfig {
  id: string;
  name: string;
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
}

export interface GenerationParams {
  model: string;
  prompt: string;
  negative_prompt?: string;
  aspect_ratio?: string;
  width?: number;
  height?: number;
  steps?: number;
  guidance_scale?: number;
  seed?: number;
  // Z-Image auxiliary files
  llmPath?: string;
  vaePath?: string;
  scheduler?: string;
}

export interface ResolvedArgs {
  binaryPath: string;
  args: string[];
  outputPath: string;
}

// Map aspect ratio strings to [width, height] dimensions.
function arToDimensions(ar: string, modelType: string): [number, number] {
  const base = modelType === "sdxl" || modelType === "z-image" || modelType === "flux" ? 1024 : 512;
  const map: Record<string, [number, number]> = {
    "1:1": [base, base],
    "16:9": [Math.round(base * 16 / 9 / 64) * 64, base],
    "9:16": [base, Math.round(base * 16 / 9 / 64) * 64],
    "4:3": [Math.round(base * 4 / 3 / 64) * 64, base],
    "3:4": [base, Math.round(base * 4 / 3 / 64) * 64],
    "21:9": [Math.round(base * 21 / 9 / 64) * 64, base],
    "3:2": [Math.round(base * 3 / 2 / 64) * 64, base],
    "2:3": [base, Math.round(base * 2 / 3 / 64) * 64],
    "5:4": [Math.round(base * 5 / 4 / 64) * 64, base],
    "4:5": [base, Math.round(base * 4 / 5 / 64) * 64],
  };
  return map[ar] ?? [base, base];
}

function coerceFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveSteps(params: GenerationParams, model: ModelConfig): number {
  const requested = coerceFiniteNumber(params.steps);
  if (requested !== null && requested > 0) return Math.max(1, Math.round(requested));
  const modelDefault = coerceFiniteNumber(model.defaultSteps);
  if (modelDefault !== null && modelDefault > 0) return Math.max(1, Math.round(modelDefault));
  return 20;
}

function resolveGuidance(params: GenerationParams, model: ModelConfig): number {
  const requested = coerceFiniteNumber(params.guidance_scale);
  if (requested !== null) return requested;
  const modelDefault = coerceFiniteNumber(model.defaultGuidance);
  if (modelDefault !== null) return modelDefault;
  return 7.5;
}

/**
 * Resolve generation parameters to a complete sd-cli command.
 */
export function resolveArgs(
  params: GenerationParams,
  model: ModelConfig,
  binaryPath: string,
  outputDir: string,
): ResolvedArgs {
  const [width, height] = arToDimensions(
    params.aspect_ratio ?? "1:1",
    model.type,
  );

  // Use explicit width/height if provided, otherwise use AR-derived dimensions
  const finalWidth = params.width ?? width;
  const finalHeight = params.height ?? height;

  const seed = params.seed !== undefined && params.seed !== -1 ? params.seed : Math.floor(Math.random() * 2147483647);

  const outputPath = `${outputDir}/gen-${Date.now()}-${seed}.png`;
  const steps = resolveSteps(params, model);
  const cfgScale = resolveGuidance(params, model);
  const sampler = model.sampler ?? "euler_a";

  // Z-Image GGUFs are loaded via --diffusion-model (not -m)
  const modelFlag = (model.type === "z-image" || model.type === "flux") ? "--diffusion-model" : "-m";

  const args: string[] = [
    modelFlag,
    model.filename, // model path will be resolved by caller
    "-p",
    params.prompt ?? "",
    "-o",
    outputPath,
    "--steps",
    String(steps),
    "-H",
    String(finalHeight),
    "-W",
    String(finalWidth),
    "--cfg-scale",
    String(cfgScale),
    "--seed",
    String(seed),
    "--sampling-method",
    sampler,
    "-v",
  ];

  if (params.negative_prompt) {
    args.push("-n", params.negative_prompt);
  }

  if (model.type === "z-image" && params.llmPath && params.vaePath) {
    args.push("--llm", params.llmPath);
    args.push("--vae", params.vaePath);
    if (params.scheduler) args.push("--scheduler", params.scheduler);
  } else if (model.type === "sdxl") {
    args.push("--sd-version", "sdxl");
  } else if (model.type === "sd2") {
    args.push("--sd-version", "sd2");
  } else if (model.type === "flux") {
    args.push("--flux");
  }

  return {
    binaryPath,
    args,
    outputPath,
  };
}
