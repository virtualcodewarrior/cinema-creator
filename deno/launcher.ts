// Launcher script that starts both Deno backend and Next.js frontend.
// Usage: deno run --allow-all deno/launcher.ts

import { ensureDataDirs, loadConfig } from "./lib/config.ts";
import { getLogger, setLogLevel } from "./lib/logger.ts";

const logger = getLogger("launcher");

const DENO_BACKEND_URL = Deno.env.get("DENO_BACKEND_URL") || "http://localhost:8000";
const FRONTEND_PORT = parseInt(Deno.env.get("FRONTEND_PORT") || "3000", 10);

logger.info("Starting AI Cinema (backend + frontend)...");

// Ensure Deno backend data directories exist
const config = loadConfig();
setLogLevel(config.logLevel);
ensureDataDirs(config.dataDir);
logger.info(`Data directory: ${config.dataDir}`);

logger.info(`Deno backend: ${DENO_BACKEND_URL}`);
logger.info(`Next.js frontend: http://localhost:${FRONTEND_PORT}`);
logger.info("");
logger.info("Press Ctrl+C to stop both services.");
logger.info("");

// Start Deno backend in a subprocess
const backendCmd = new Deno.Command("deno", {
  args: ["run", "--allow-all", "main.ts"],
  cwd: new URL(".", import.meta.url).pathname,
  env: {
    ...Deno.env.toObject(),
    AI_CINEMA_HOME: config.dataDir,
    DENO_DIR: `${config.dataDir}/cache`,
  },
  stdout: "inherit",
  stderr: "inherit",
});

const backendProcess = backendCmd.spawn();

// Start Next.js frontend in a subprocess
const projectRoot = new URL("../", import.meta.url).pathname;
const frontendCmd = new Deno.Command("npm", {
  args: ["run", "dev:self-hosted"],
  cwd: projectRoot,
  env: {
    ...Deno.env.toObject(),
    NEXT_PUBLIC_SELF_HOSTED: "1",
    DENO_BACKEND_URL,
    PORT: String(FRONTEND_PORT),
  },
  stdout: "inherit",
  stderr: "inherit",
});

const frontendProcess = frontendCmd.spawn();

// Wait for Ctrl+C
const signal = new AbortController();
Deno.addSignalListener("SIGINT", () => signal.abort());
Deno.addSignalListener("SIGTERM", () => signal.abort());

// Wait for abort signal via Promise
await new Promise<void>((resolve) => {
  signal.signal.addEventListener("abort", () => resolve(), { once: true });
});
logger.info("Shutting down...");

// Kill processes only if still running
try { backendProcess.kill("SIGTERM"); } catch { /* already terminated */ }
try { frontendProcess.kill("SIGTERM"); } catch { /* already terminated */ }

// Give processes time to terminate gracefully
await new Promise(r => setTimeout(r, 1000));

// Force kill if still running
try { backendProcess.kill("SIGKILL"); } catch { /* already terminated */ }
try { frontendProcess.kill("SIGKILL"); } catch { /* already terminated */ }

await Promise.allSettled([
  backendProcess.status,
  frontendProcess.status,
]);

logger.info("Stopped.");
Deno.exit(0);
