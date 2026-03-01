// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Create a resolved Promise<Response> with binary body.
 * Useful for mocking `fetch()` in tests for binary endpoints.
 */
export function binaryResponse(data: Buffer | Uint8Array, init?: ResponseInit): Promise<Response> {
  return Promise.resolve(
    new Response(data, {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
      ...init,
    }),
  );
}
