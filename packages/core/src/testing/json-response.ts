// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Create a resolved Promise<Response> with JSON body.
 * Useful for mocking `fetch()` in tests.
 */
export function jsonResponse(body: unknown, init?: ResponseInit): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
      ...init,
    }),
  );
}
