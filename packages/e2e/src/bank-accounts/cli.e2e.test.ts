// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it } from "vitest";
import { hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";

// ---------------------------------------------------------------------------
// SCA write paths: ACCEPTED_GAP — all 3 endpoints blocked by sandbox state
// ---------------------------------------------------------------------------
//
// Empirical sandbox probe (2026-05-12, sandbox org `0909-future-club-2702`,
// OAuth token with `bank_account.write` scope granted):
//
//   - `POST /v2/bank_accounts`            → 400 bank_accounts_limit
//       "You have reached the maximum number of bank accounts allowed for
//        your plan" — plan cap hit; cannot create a fresh test account.
//
//   - `PUT  /v2/bank_accounts/{id}`       → 404 not_found
//       Both pre-existing accounts return 404 on update (main `Hauptkonto`
//       AND non-main `asdfasdf`). Path may be wrong, OR Qonto may use a
//       different endpoint/method (e.g., PATCH) for bank account updates.
//
//   - `POST /v2/bank_accounts/{id}/close` → ACCEPTED_GAP (destructive)
//       Closing either pre-existing account is destructive and irreversible.
//       The plan-limit blocker on `create` makes recreation impossible —
//       closing existing accounts would brick subsequent test runs.
//
// Because all three lifecycle endpoints are blocked, the entire CLI SCA
// write-paths describe block is ACCEPTED_GAP. The MCP wrap fix (the load-
// bearing production change) was delivered in #553 (commit `62544cd`).
// CLI wraps in `packages/cli/src/commands/account.ts` are confirmed correct
// by audit-refresh inspection — all three subcommands wrap with
// `executeWithCliSca`, structurally identical to the SCA-wrap permutation
// proven by #554 (transfers), #555 (requests), and #556 (cards).
//
// Re-enable procedure (when sandbox is unblocked):
//
//   1. Re-probe the sandbox manually: `qontoctl --auth oauth-first
//      account create --name e2e-probe-$(date +%s)` then `qontoctl --auth
//      oauth-first account update {id} --name foo`. If both succeed, proceed.
//   2. Replace the `it.todo(...)` below with a lifecycle `it(...)` modeled on
//      `packages/e2e/src/cards/cli.e2e.test.ts` (using `runWithConditionalSca`
//      helper for tolerance to with-SCA vs no-SCA outcomes).
//   3. Update `packages/e2e/coverage.json` entries
//      (cli:packages/cli/src/commands/account.ts notes + mcp:account_create/
//      update/close status `accepted_gap` → `covered` with the lifecycle test
//      file path).
//   4. Run `pnpm test:e2e` (full suite) locally before pushing.
//
// Read-side coverage (`account list`, `account show`, `account iban-certificate`)
// lives in `packages/e2e/src/org-accounts/cli.e2e.test.ts` — out of scope here.
//
// See #563 for the deferral history (spun off from #553).

describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())(
  "bank-account CLI commands (e2e, SCA write paths)",
  () => {
    pinAuthPreference("oauth-first");

    // ACCEPTED_GAP: see top-of-file empirical-findings note for the 3
    // sandbox blockers. The wrap shape is proven by #554/#555/#556; this
    // marker placeholds the lifecycle test for when the sandbox is
    // unblocked.
    it.todo("bank-account lifecycle: create → update → close (pending sandbox unblock — see #563)");
  },
);
