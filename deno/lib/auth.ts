// API key validation for the Deno backend.
// Simple token-based auth: a single API key is stored in config.
// The key can be set via AI_CINEMA_API_KEY env var or config.json.

import type { Config } from "./config.ts";

export interface AuthResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate an API key against the configured key.
 * If no key is configured, all requests are allowed (open mode).
 */
export function validateApiKey(key: string | undefined, config: Config): AuthResult {
  // Open mode: no key configured, allow all
  if (!config.apiKey || config.apiKey.trim() === "") {
    return { valid: true };
  }

  if (!key) {
    return { valid: false, error: "Missing API key" };
  }

  if (key.trim() !== config.apiKey) {
    return { valid: false, error: "Invalid API key" };
  }

  return { valid: true };
}

/**
 * Extract the API key from request headers.
 * Checks both `x-api-key` header and `Authorization: Bearer <key>`.
 */
export function extractApiKey(headers: Headers): string | undefined {
  return headers.get("x-api-key") ?? headers.get("authorization")?.replace(/^Bearer\s+/i, "");
}
