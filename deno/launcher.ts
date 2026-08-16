// Launcher script that builds the frontend and starts the Deno backend.
// The Deno backend serves both the API and the static frontend files.
// Usage: deno run --allow-all deno/launcher.ts

import { ensureDataDirs, loadConfig } from "./lib/config.ts";
import { getLogger, setLogLevel } from "./lib/logger.ts";

const logger = getLogger("launcher");

const DENO_BACKEND_URL = Deno.env.get("DENO_BACKEND_URL") || "http://localhost:8000";
const FRONTEND_PORT = parseInt(Deno.env.get("FRONTEND_PORT") || "8000", 10);
const SKIP_FRONTEND_BUILD = Deno.env.get("SKIP_FRONTEND_BUILD") === "1";

logger.info("Starting AI Cinema (Deno backend + frontend)...");

// Ensure Deno backend data directories exist
const config = loadConfig();
setLogLevel(config.logLevel);
ensureDataDirs(config.dataDir);
logger.info(`Data directory: ${config.dataDir}`);

logger.info(`Backend URL: ${DENO_BACKEND_URL}`);
logger.info(`Frontend port: ${FRONTEND_PORT}`);
logger.info("");

// Build frontend if not skipped
if (!SKIP_FRONTEND_BUILD) {
  logger.info("Building frontend...");
  const projectRoot = new URL("../", import.meta.url).pathname;
  
  const buildCmd = new Deno.Command("npm", {
    args: ["run", "build:self-hosted"],
    cwd: projectRoot,
    env: {
      ...Deno.env.toObject(),
      NEXT_PUBLIC_SELF_HOSTED: "1",
    },
    stdout: "piped",
    stderr: "piped",
  });

  const buildProcess = buildCmd.spawn();
  const buildStatus = await buildProcess.status;
  
  if (!buildStatus.success) {
    const stderr = await buildProcess.stderr;
    logger.error(`Frontend build failed: ${new TextDecoder().decode(stderr)}`);
    logger.info("Continuing without frontend build...");
  } else {
    logger.info("Frontend built successfully.");
  }
  logger.info("");
}

// Start Deno backend (which now serves both API and frontend)
const backendCmd = new Deno.Command("deno", {
  args: ["run", "--allow-all", "main.ts"],
  cwd: new URL(".", import.meta.url).pathname,
  env: {
    ...Deno.env.toObject(),
    AI_CINEMA_HOME: config.dataDir,
    DENO_DIR: `${config.dataDir}/cache`,
    AI_CINEMA_PORT: String(FRONTEND_PORT),
  },
  stdout: "inherit",
  stderr: "inherit",
});

const backendProcess = backendCmd.spawn();

// Wait for Ctrl+C
const signal = new AbortController();
Deno.addSignalListener("SIGINT", () => signal.abort());
Deno.addSignalListener("SIGTERM", () => signal.abort());

// Wait for abort signal via Promise
await new Promise<void>((resolve) => {
  signal.signal.addEventListener("abort", () => resolve(), { once: true });
});
logger.info("Shutting down...");

// Kill backend process
try { backendProcess.kill("SIGTERM"); } catch { /* already terminated */ }

// Give process time to terminate gracefully
await new Promise(r => setTimeout(r, 1000));

// Force kill if still running
try { backendProcess.kill("SIGKILL"); } catch { /* already terminated */ }

await Promise.allSettled([backendProcess.status]);

logger.info("Stopped.");
Deno.exit(0);
