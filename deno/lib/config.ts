// Configuration management for the Deno backend.
// Reads from env vars and a local config file.

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  apiKey: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

const DEFAULTS: Config = {
  port: 8000,
  host: "127.0.0.1",
  dataDir: "~/.ai-cinema",
  apiKey: "",
  logLevel: "info",
};

function resolveDataDir(raw: string): string {
  if (raw.startsWith("~/")) {
    const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
    if (!home) throw new Error("Cannot resolve ~ in data directory: $HOME not set");
    return home + raw.slice(1);
  }
  return raw;
}

function readConfigFile(path: string): Partial<Config> | null {
  try {
    const content = Deno.readTextFileSync(path);
    return JSON.parse(content) as Partial<Config>;
  } catch {
    return null;
  }
}

export function loadConfig(): Config {
  // Try to read config file from data directory
  const rawDir = resolveDataDir(Deno.env.get("AI_CINEMA_HOME") ?? DEFAULTS.dataDir);
  const configPath = rawDir + "/config.json";
  const fileConfig = readConfigFile(configPath);

  const apiKey = Deno.env.get("AI_CINEMA_API_KEY") ?? fileConfig?.apiKey ?? "";

  const config: Config = {
    port: parseInt(Deno.env.get("AI_CINEMA_PORT") ?? String(DEFAULTS.port)),
    host: Deno.env.get("AI_CINEMA_HOST") ?? DEFAULTS.host,
    dataDir: rawDir,
    apiKey,
    logLevel: (Deno.env.get("AI_CINEMA_LOG_LEVEL") ?? DEFAULTS.logLevel) as Config["logLevel"],
  };

  return config;
}

export function ensureDataDirs(dataDir: string): void {
  const dirs = ["models", "uploads", "output", "tmp", "bin"];
  for (const dir of dirs) {
    const fullPath = dataDir + "/" + dir;
    try {
      Deno.mkdirSync(fullPath, { recursive: true });
    } catch (e) {
      if (!(e instanceof Deno.errors.AlreadyExists)) {
        throw e;
      }
    }
  }
}
