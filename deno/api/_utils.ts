// Shared utilities for API route handlers.

export interface ApiResponse {
  ok: boolean;
  error?: string;
}

/**
 * Create a JSON response with proper CORS headers.
 */
export function jsonResponse<T extends ApiResponse>(
  body: T,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
    },
  });
}

/**
 * Handle CORS preflight requests.
 */
export function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
