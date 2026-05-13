// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import {
  OAUTH_REVOKE_SANDBOX_URL,
  OAUTH_TOKEN_SANDBOX_URL,
  refreshAccessToken,
  revokeToken,
  SANDBOX_BASE_URL,
} from "@qontoctl/core";
import { beforeAll, describe, expect, it } from "vitest";

import {
  getCredentials,
  getE2ERefreshToken,
  hasE2ERefreshToken,
  hasOAuthCredentials,
  hasStagingToken,
} from "../sandbox.js";

// -----------------------------------------------------------------------------
// OAuth flow round-trip suite — exercises `refreshAccessToken` and `revokeToken`
// against the real Qonto sandbox OAuth server. Closes #460 (Group 8 of #449).
//
// Gate: requires OAuth client credentials, a staging token (sandbox routing),
// AND a seed refresh token (`QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG` env var
// or `oauth.refresh-token` in `.qontoctl.yaml`). The seed token is consumed
// on each successful run (Qonto rotates refresh tokens on every refresh) —
// see `docs/ci-oauth-secrets.md` for the one-time-use rotation strategy.
//
// `exchangeCode` is intentionally NOT covered: the authorization-code flow
// requires browser interaction (user authentication + consent) which cannot
// be automated headlessly without significant test infrastructure. Documented
// as `accepted_gap` in `packages/e2e/coverage.json`.
// -----------------------------------------------------------------------------

describe.skipIf(!hasOAuthCredentials() || !hasStagingToken() || !hasE2ERefreshToken())(
  "OAuth flow against real OAuth server (e2e, sandbox)",
  () => {
    let clientId: string;
    let clientSecret: string;
    let stagingToken: string;
    let seedRefreshToken: string;

    // Access token from the refresh test, consumed by the revoke test. Vitest
    // runs `it` blocks sequentially within a file, and the project pins
    // `--concurrency=1` (see CLAUDE.md § E2E Testing), so the cross-test
    // hand-off is deterministic. Sharing one access token across both tests
    // is the only way to exercise revoke against a freshly-issued token
    // without burning a second seed refresh token per run.
    let freshAccessToken: string | undefined;

    beforeAll(() => {
      const creds = getCredentials();
      if (!creds.clientId || !creds.clientSecret || !creds.stagingToken) {
        throw new Error(
          "E2E setup: expected OAuth client credentials and staging token (suite gate should have skipped)",
        );
      }
      clientId = creds.clientId;
      clientSecret = creds.clientSecret;
      stagingToken = creds.stagingToken;
      seedRefreshToken = getE2ERefreshToken();
    });

    // AC: Given a valid sandbox refresh token,
    //     When `refreshAccessToken` is called against the sandbox token endpoint,
    //     Then it returns a new access token, a (rotated) refresh token,
    //     a positive `expires_in`, and a bearer token type.
    it("refreshAccessToken returns rotated tokens against the sandbox", async () => {
      const tokens = await refreshAccessToken(
        OAUTH_TOKEN_SANDBOX_URL,
        clientId,
        clientSecret,
        seedRefreshToken,
        stagingToken,
      );

      expect(tokens.accessToken).toBeTruthy();
      expect(typeof tokens.accessToken).toBe("string");
      expect(tokens.tokenType.toLowerCase()).toBe("bearer");
      expect(tokens.expiresIn).toBeGreaterThan(0);

      // Qonto rotates refresh tokens on every refresh — the returned token
      // MUST differ from the one we sent. This rotation is what makes
      // CI-stored refresh tokens "burn on use" and motivates the
      // one-time-use rotation strategy documented in
      // `docs/ci-oauth-secrets.md`.
      expect(tokens.refreshToken).toBeTruthy();
      expect(tokens.refreshToken).not.toBe(seedRefreshToken);

      freshAccessToken = tokens.accessToken;
    });

    // AC: Given a freshly-issued access token from `refreshAccessToken`,
    //     When `revokeToken` is called against the sandbox revoke endpoint,
    //     Then a subsequent API call carrying that access token returns 401.
    it("revokeToken renders an access token unusable for API calls", async () => {
      if (freshAccessToken === undefined) {
        throw new Error("Cannot test revoke: refresh test did not produce an access token (check earlier failure)");
      }

      // Sanity check: the freshly-refreshed access token works against the
      // sandbox API BEFORE we revoke it. This eliminates false negatives
      // where the 401 was caused by something other than revocation.
      const sanityCheck = await fetch(`${SANDBOX_BASE_URL}/v2/organization`, {
        headers: {
          Authorization: `Bearer ${freshAccessToken}`,
          "X-Qonto-Staging-Token": stagingToken,
        },
      });
      expect(sanityCheck.status).toBe(200);

      await revokeToken(OAUTH_REVOKE_SANDBOX_URL, clientId, clientSecret, freshAccessToken, stagingToken);

      const afterRevoke = await fetch(`${SANDBOX_BASE_URL}/v2/organization`, {
        headers: {
          Authorization: `Bearer ${freshAccessToken}`,
          "X-Qonto-Staging-Token": stagingToken,
        },
      });
      expect(afterRevoke.status).toBe(401);
    });
  },
);
