// Simple structured logger for the Deno backend.

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogger(prefix: string): Logger {
  return {
    debug: (msg: string, ...args: unknown[]) => log("debug", prefix, msg, args),
    info: (msg: string, ...args: unknown[]) => log("info", prefix, msg, args),
    warn: (msg: string, ...args: unknown[]) => log("warn", prefix, msg, args),
    error: (msg: string, ...args: unknown[]) => log("error", prefix, msg, args),
  };
}

function log(
  level: LogLevel,
  prefix: string,
  msg: string,
  args: unknown[],
): void {
  if (LEVELS[level] < LEVELS[currentLevel]) return;

  const timestamp = new Date().toISOString();
  const color = COLORS[level];
  const label = `${level.toUpperCase().padEnd(5)}`;
  const prefixStr = `[${prefix.padEnd(12)}]`;

  const line = `${color}[${timestamp}] ${label} ${prefixStr}${RESET} ${msg}`;

  if (level === "error") {
    console.error(line, ...args);
  } else {
    console.log(line, ...args);
  }
}

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}
