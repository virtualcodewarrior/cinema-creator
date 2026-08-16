// API route: GET /api/v1/account/balance
// Muapi-compatible account balance endpoint.
// For self-hosted mode, returns a dummy balance.

import { type ApiResponse, jsonResponse } from "./_utils.ts";

export interface MuapiBalanceResponse extends ApiResponse {
  data: {
    balance: number;
    credits?: number;
  };
}

export function handleMuapiBalanceRequest(): Response {
  // Self-hosted mode: unlimited balance
  return jsonResponse({
    ok: true,
    data: {
      balance: 999999.99,
      credits: 999999,
    },
  });
}
