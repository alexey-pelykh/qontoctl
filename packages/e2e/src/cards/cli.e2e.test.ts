// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { CardSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { CLI_PATH, cli, cliJson, skipMissingFixture } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, hasStagingToken, pinAuthPreference } from "../sandbox.js";
import { SCA_POLL_URL_RE } from "../sca-helpers.js";

const execFileAsync = promisify(execFile);

interface CardItem {
  readonly id: string;
  readonly nickname: string | null;
  readonly last_digits: string | null;
  readonly status: string;
  readonly card_level: string;
  readonly holder_id: string;
}

describe.skipIf(!hasOAuthCredentials())("card CLI commands (e2e)", () => {
  pinAuthPreference("oauth-first");

  describe("card list", () => {
    it("lists cards with default output", () => {
      const output = cli("card", "list");
      expect(output).toBeDefined();
    });

    it("lists cards as JSON", () => {
      const cards = cliJson<CardItem[]>("card", "list");
      expect(Array.isArray(cards)).toBe(true);
      const first = cards[0];
      if (first !== undefined) {
        CardSchema.parse(first);
        expect(first).toHaveProperty("id");
        expect(first).toHaveProperty("status");
        expect(first).toHaveProperty("card_level");
      }
    });

    it("supports pagination", () => {
      const cards = cliJson<CardItem[]>("card", "list", "--per-page", "2", "--page", "1");
      expect(Array.isArray(cards)).toBe(true);
      expect(cards.length).toBeLessThanOrEqual(2);
    });

    it("filters by status", () => {
      const cards = cliJson<CardItem[]>("card", "list", "--status", "live");
      expect(Array.isArray(cards)).toBe(true);
      for (const c of cards) {
        expect(c.status).toBe("live");
      }
    });

    it("filters by card level", () => {
      const cards = cliJson<CardItem[]>("card", "list", "--card-level", "virtual");
      expect(Array.isArray(cards)).toBe(true);
      for (const c of cards) {
        expect(c.card_level).toBe("virtual");
      }
    });

    it("outputs CSV format", (ctx) => {
      // CSV formatter emits no output for an empty list, so there is no header
      // row to assert against — skip when the sandbox has zero cards.
      const cards = cliJson<CardItem[]>("card", "list", "--per-page", "5");
      if (cards[0] === undefined) {
        skipMissingFixture(ctx, "no cards in sandbox for CSV output assertion");
      }

      const output = cli("card", "list", "--output", "csv", "--per-page", "5");
      const lines = output.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const header = lines[0] ?? "";
      expect(header).toContain("id");
      expect(header).toContain("status");
    });

    it("outputs YAML format", (ctx) => {
      // YAML formatter emits `[]` for an empty list, so there is no `id:`
      // field to assert against — skip when the sandbox has zero cards.
      const cards = cliJson<CardItem[]>("card", "list", "--per-page", "2");
      if (cards[0] === undefined) {
        skipMissingFixture(ctx, "no cards in sandbox for YAML output assertion");
      }

      const output = cli("card", "list", "--output", "yaml", "--per-page", "2");
      expect(output).toContain("id:");
    });
  });

  describe("card show", () => {
    it("shows a card by ID", (ctx) => {
      // Pick the first card from the list as a known-good ID. If the org has
      // no cards in the sandbox, skip — we cannot exercise show without one.
      const cards = cliJson<CardItem[]>("card", "list", "--per-page", "1");
      const first = cards[0];
      if (first === undefined) {
        skipMissingFixture(ctx, "no cards in sandbox to resolve an id for card show");
      }

      const card = cliJson<CardItem>("card", "show", first.id);
      CardSchema.parse(card);
      expect(card.id).toBe(first.id);
      expect(card).toHaveProperty("status");
      expect(card).toHaveProperty("card_level");
    });

    it("supports table output", (ctx) => {
      const cards = cliJson<CardItem[]>("card", "list", "--per-page", "1");
      const first = cards[0];
      if (first === undefined) {
        skipMissingFixture(ctx, "no cards in sandbox to resolve an id for card show table output");
      }

      const output = cli("card", "show", first.id);
      expect(output).toContain(first.id);
    });
  });

  describe("card iframe-url", () => {
    it("returns a secure iframe URL for an existing card", (ctx) => {
      // Pick the first non-virtual live card — the data_view endpoint
      // returns 400 for virtual cards in the sandbox (empirical 2026-05-12;
      // probed across 5 virtual cards, all returning `400 unknown`). The
      // SCA write-paths suite below creates virtual cards because the
      // sandbox auto-activates them without a manual pairing step; the
      // accumulating virtual stack would otherwise mask this test as
      // failing rather than skipping. Skip cleanly when no physical card
      // is available — the test was a silent no-op in zero-card sandboxes
      // before #556 and the no-op semantics are preserved here.
      const cards = cliJson<CardItem[]>("card", "list", "--status", "live");
      const first = cards.find((c) => c.card_level !== "virtual" && c.card_level !== "virtual_partner");
      if (first === undefined) {
        skipMissingFixture(ctx, "no non-virtual live card in sandbox for iframe-url");
      }

      const result = cliJson<{ iframe_url: string }>("card", "iframe-url", first.id);
      expect(result).toHaveProperty("iframe_url");
      expect(typeof result.iframe_url).toBe("string");
      // The URL must be HTTPS — the iframe carries sensitive PAN/CVV data.
      expect(result.iframe_url).toMatch(/^https:\/\//);
    });
  });
});

interface CreatedCard {
  readonly id: string;
  readonly status: string;
  readonly nickname: string | null;
  readonly atm_option: boolean;
  readonly nfc_option: boolean;
  readonly online_option: boolean;
  readonly foreign_option: boolean;
  readonly atm_monthly_limit: number;
  readonly payment_monthly_limit: number;
  readonly active_days: readonly number[];
  readonly categories: readonly string[];
  readonly holder_id: string;
  readonly bank_account_id: string;
  readonly card_level: string;
}

interface SpawnedCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly scaTriggered: boolean;
}

/**
 * Spawn an SCA-wrapped CLI command and tolerate either path (SCA triggers, or
 * direct success). Watches stderr for the polling URL, mock-approves the
 * captured token if seen, and awaits exit. Mirrors the conditional-SCA
 * helper in `packages/e2e/src/transfers/cli.e2e.test.ts` (#554) and
 * `packages/e2e/src/requests/cli.e2e.test.ts` (#555) — empirical sandbox
 * SCA enforcement varies per endpoint, so the conditional shape covers
 * both "SCA fires + mock-approve" and "no SCA + direct 200/204" outcomes.
 */
async function runWithConditionalSca(args: readonly string[]): Promise<SpawnedCliResult> {
  const child = spawn("node", [CLI_PATH, "--verbose", "--output", "json", ...args], {
    env: cliEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let stderrBuffer = "";
  let scaToken: string | undefined;
  let approvePromise: Promise<unknown> = Promise.resolve();

  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf-8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
    if (scaToken !== undefined) return;
    stderrBuffer += chunk;
    let nlIdx: number;
    while ((nlIdx = stderrBuffer.indexOf("\n")) !== -1) {
      const line = stderrBuffer.slice(0, nlIdx);
      stderrBuffer = stderrBuffer.slice(nlIdx + 1);
      if (scaToken !== undefined) continue;
      const match = line.match(SCA_POLL_URL_RE);
      if (match !== null && match[1] !== undefined) {
        scaToken = match[1];
        approvePromise = execFileAsync("node", [CLI_PATH, "sca-session", "mock-decision", scaToken, "allow"], {
          env: cliEnv(),
          timeout: 25_000,
        });
      }
    }
  });

  const exit = await new Promise<{ readonly code: number | null }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code });
    });
  });
  await approvePromise;

  return {
    stdout,
    stderr,
    exitCode: exit.code,
    scaTriggered: scaToken !== undefined,
  };
}

// Empirical sandbox probe (2026-05-12 re-probe against sandbox org
// `0909-future-club-2702`, OAuth token with all card.write scopes):
//
//   - `POST /v2/cards`                                  → 428 SCA, then 200 (works)
//   - `POST /v2/cards/bulk`                             → 404 not_found  (precondition: docs/qonto-sandbox-preconditions.md#post-v2-cards-bulk)
//   - `POST /v2/cards/{id}/lock`                        → 200 (works, NOT SCA-gated in sandbox)
//   - `POST /v2/cards/{id}/unlock`                      → 428 SCA, then 200 (works)
//   - `PUT  /v2/cards/{id}/limits`                      → 428 SCA, then 200 (works)
//   - `PUT  /v2/cards/{id}/nickname`                    → 200 (works, NOT SCA-gated in sandbox)
//   - `PUT  /v2/cards/{id}/options`                     → 403 Forbidden (precondition: docs/qonto-sandbox-preconditions.md#put-v2-cards-id-options)
//   - `PUT  /v2/cards/{id}/restrictions`                → 200 (works, NOT SCA-gated in sandbox; was 403 pre-2026-05-12)
//
// Two of the 8 covered endpoints still return non-200 in the sandbox
// despite all card.write scopes being granted on the OAuth token — same
// sandbox-plan / admin-role pattern observed in #555 (request 4/5
// endpoints 403) and #554 (transfer_proof 404). E2E coverage for those
// two (bulk-create, update-options) remains deferred under #570 (linked
// in the deferral note at the bottom of this file). CLI + MCP code paths
// for BOTH are confirmed correct by audit-refresh inspection — both wrap
// with `executeWithCliSca` / `executeWithMcpSca`, structurally identical
// to the 6 covered endpoints below.
//
// `PUT /v2/cards/{id}/restrictions` flipped from 403 → 200 between the
// 2026-04 #556 probe and the 2026-05-12 re-probe without any user-visible
// config change (likely sandbox-plan tier upgrade by Qonto). It is
// covered here as round-trip #6 in the lifecycle test below.
//
// Per #551 user feedback ("graceful skip is BAD — bail out with error"),
// we do NOT add a conditional skip wrapper that would swallow the 403/404
// silently. The 6-of-8 covered endpoints below exercise every distinct
// SCA-wrapping permutation on the working sandbox surface (both true
// SCA-gating with mock-decision round-trip AND no-SCA direct 200 through
// the same wrap), so the deferred two add no incremental wrap-shape
// coverage.
//
// Idempotency strategy: each test run creates 1 fresh card (used for all
// 5 update/lock/restrictions lifecycle ops) — the card is NEVER discarded
// here because `discardCard` / `reportCardLost` / `reportCardStolen` are
// terminal-state ACCEPTED_GAP endpoints (see deferral note below). Cards
// accumulate in the sandbox across runs. Empirical determination: the
// sandbox tolerated 5 stacked test cards in a row without throttling
// (manual probes 2026-05-12); the per-org card cap is not publicly
// documented but is well above the 1/run rate this suite produces.
//
// All 6 covered endpoints are exercised against a single shared
// `testCardId` to minimize sandbox-card accumulation. Lock/unlock cycle
// leaves the card in its post-unlock `live` state — symmetric with the
// natural starting state of a freshly-activated card — at which point
// `update-restrictions` runs as the final round-trip.

describe.skipIf(!hasOAuthCredentials() || !hasStagingToken())("card CLI commands (e2e, SCA write paths)", () => {
  pinAuthPreference("oauth-first");

  it("card lifecycle: create → update-{nickname,limits} → lock/unlock (conditional SCA-gating)", async () => {
    // ---- Setup: discover holder/initiator, bank account, and org slug.
    // The API accepts the organization SLUG as `organization_id` (empirical
    // 2026-05-12 — sandbox maps the slug to the canonical org UUID
    // server-side and returns the UUID in the response).
    interface OrgShow {
      readonly slug: string;
      readonly bank_accounts: readonly { readonly id: string; readonly iban: string; readonly main: boolean }[];
    }
    const org = cliJson<OrgShow>("org", "show");
    const orgSlug = org.slug;
    const account = org.bank_accounts.find((a) => a.main) ?? org.bank_accounts[0];
    if (account === undefined) {
      throw new Error("E2E setup: no bank accounts in sandbox");
    }

    // Membership ID drives both `holder_id` and `initiator_id`. The umbrella
    // CLI exposes `membership list`; the test org has exactly one membership
    // (owner) which we use as both holder and initiator. Self-issuing is
    // valid in the Qonto sandbox.
    interface MembershipItem {
      readonly id: string;
      readonly role: string;
    }
    const memberships = cliJson<readonly MembershipItem[]>("membership", "list");
    const holder = memberships[0];
    if (holder === undefined) {
      throw new Error("E2E setup: no memberships in sandbox");
    }
    const holderId = holder.id;

    // ---- Round-trip #1: create card (SCA-gated, empirically confirmed).
    const createResult = await runWithConditionalSca([
      "card",
      "create",
      "--holder-id",
      holderId,
      "--initiator-id",
      holderId,
      "--organization-id",
      orgSlug,
      "--bank-account-id",
      account.id,
      "--card-level",
      "virtual",
    ]);

    if (createResult.scaTriggered) {
      console.log(`[card create SCA probe] SCA triggered; round-trip exercised.`);
      expect(createResult.stderr).toMatch(SCA_POLL_URL_RE);
    } else {
      console.log(`[card create SCA probe] NO SCA in OAuth+sandbox.`);
    }
    if (createResult.exitCode !== 0) {
      throw new Error(
        `card create exited ${String(createResult.exitCode)}\n--- stderr ---\n${createResult.stderr}\n--- stdout ---\n${createResult.stdout}`,
      );
    }
    const created = JSON.parse(createResult.stdout) as CreatedCard;
    CardSchema.parse(created);
    expect(created.id.length).toBeGreaterThan(0);
    expect(created.card_level).toBe("virtual");
    expect(created.holder_id).toBe(holderId);
    expect(created.bank_account_id).toBe(account.id);
    const testCardId = created.id;

    // ---- Round-trip #2: update-nickname.
    const nickname = `e2e-${randomUUID().slice(0, 8)}`;
    const nicknameResult = await runWithConditionalSca(["card", "update-nickname", testCardId, "--nickname", nickname]);
    if (nicknameResult.scaTriggered) {
      console.log(`[card update-nickname SCA probe] SCA triggered; round-trip exercised.`);
    } else {
      console.log(`[card update-nickname SCA probe] NO SCA in OAuth+sandbox.`);
    }
    if (nicknameResult.exitCode !== 0) {
      throw new Error(
        `card update-nickname exited ${String(nicknameResult.exitCode)}\n--- stderr ---\n${nicknameResult.stderr}\n--- stdout ---\n${nicknameResult.stdout}`,
      );
    }
    const nicknameUpdated = JSON.parse(nicknameResult.stdout) as CreatedCard;
    expect(nicknameUpdated.id).toBe(testCardId);
    expect(nicknameUpdated.nickname).toBe(nickname);

    // ---- Round-trip #3: update-limits.
    //
    // Note: virtual cards have a hard `atm_monthly_limit` cap of 20 EUR in
    // the Qonto sandbox — attempting to raise it above 20 silently returns
    // the previous value. We exercise `payment_monthly_limit` (no such cap)
    // to assert that the update lands; the SCA wrap is the focus, not the
    // per-card-level business rules.
    const limitsResult = await runWithConditionalSca([
      "card",
      "update-limits",
      testCardId,
      "--payment-monthly-limit",
      "75",
    ]);
    if (limitsResult.scaTriggered) {
      console.log(`[card update-limits SCA probe] SCA triggered; round-trip exercised.`);
    } else {
      console.log(`[card update-limits SCA probe] NO SCA in OAuth+sandbox.`);
    }
    if (limitsResult.exitCode !== 0) {
      throw new Error(
        `card update-limits exited ${String(limitsResult.exitCode)}\n--- stderr ---\n${limitsResult.stderr}\n--- stdout ---\n${limitsResult.stdout}`,
      );
    }
    const limitsUpdated = JSON.parse(limitsResult.stdout) as CreatedCard;
    expect(limitsUpdated.id).toBe(testCardId);
    expect(limitsUpdated.payment_monthly_limit).toBe(75);

    // ---- Round-trip #4: lock.
    const lockResult = await runWithConditionalSca(["card", "lock", testCardId]);
    if (lockResult.scaTriggered) {
      console.log(`[card lock SCA probe] SCA triggered; round-trip exercised.`);
    } else {
      console.log(`[card lock SCA probe] NO SCA in OAuth+sandbox.`);
    }
    if (lockResult.exitCode !== 0) {
      throw new Error(
        `card lock exited ${String(lockResult.exitCode)}\n--- stderr ---\n${lockResult.stderr}\n--- stdout ---\n${lockResult.stdout}`,
      );
    }
    const locked = JSON.parse(lockResult.stdout) as CreatedCard;
    expect(locked.id).toBe(testCardId);
    expect(locked.status).toBe("paused");

    // ---- Round-trip #5: unlock — leaves the card in its starting state.
    const unlockResult = await runWithConditionalSca(["card", "unlock", testCardId]);
    if (unlockResult.scaTriggered) {
      console.log(`[card unlock SCA probe] SCA triggered; round-trip exercised.`);
    } else {
      console.log(`[card unlock SCA probe] NO SCA in OAuth+sandbox.`);
    }
    if (unlockResult.exitCode !== 0) {
      throw new Error(
        `card unlock exited ${String(unlockResult.exitCode)}\n--- stderr ---\n${unlockResult.stderr}\n--- stdout ---\n${unlockResult.stdout}`,
      );
    }
    const unlocked = JSON.parse(unlockResult.stdout) as CreatedCard;
    expect(unlocked.id).toBe(testCardId);
    expect(unlocked.status).not.toBe("paused");

    // ---- Round-trip #6: update-restrictions.
    //
    // Empirical 2026-05-12: this endpoint flipped from 403 Forbidden (the
    // original probe at #556) to 200 OK without any user-visible config
    // change — most likely a sandbox-plan tier upgrade by Qonto. Covered
    // here as the final round-trip; runs against the post-unlock `live`
    // card. SCA was NOT triggered in the 2026-05-12 probe (see header
    // empirical table) — `runWithConditionalSca` tolerates either path.
    //
    // Exercise a meaningful change (`--active-days 1 2 3 4 5`, Mon–Fri)
    // rather than the no-op all-7-days probe used in #570's empirical
    // re-check; the response must echo the requested subset so we can
    // assert the update landed (mirroring the `payment_monthly_limit`
    // assertion in round-trip #3).
    const restrictionsResult = await runWithConditionalSca([
      "card",
      "update-restrictions",
      testCardId,
      "--active-days",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    if (restrictionsResult.scaTriggered) {
      console.log(`[card update-restrictions SCA probe] SCA triggered; round-trip exercised.`);
    } else {
      console.log(`[card update-restrictions SCA probe] NO SCA in OAuth+sandbox.`);
    }
    if (restrictionsResult.exitCode !== 0) {
      throw new Error(
        `card update-restrictions exited ${String(restrictionsResult.exitCode)}\n--- stderr ---\n${restrictionsResult.stderr}\n--- stdout ---\n${restrictionsResult.stdout}`,
      );
    }
    const restrictionsUpdated = JSON.parse(restrictionsResult.stdout) as CreatedCard;
    expect(restrictionsUpdated.id).toBe(testCardId);
    expect([...restrictionsUpdated.active_days]).toEqual([1, 2, 3, 4, 5]);
  });
});

// ACCEPTED_GAP: `card report-lost`, `card report-stolen`, `card discard`
// E2E coverage is DEFERRED — terminal state, would consume the test card
// per run. The CLI wraps all three with `executeWithCliSca` (verified by
// audit-refresh inspection of `packages/cli/src/commands/card/{discard,report}.ts`),
// so the SCA path is structurally identical to the 6 covered endpoints
// above. Exercising the destructive trio would force a 2-card-per-run
// burn rate (1 lifecycle card, 1 sacrificial card per destructive op),
// or 4-card-per-run, with no way to recover a card once `discarded` /
// `lost` / `stolen`. The covered 6 already exercise every SCA-wrapping
// permutation on the working sandbox surface; the destructive endpoints
// add no incremental SCA-shape coverage. Tracked in #458 as the only
// ACCEPTED_GAP cluster for this sub-issue.
//
// NOTE: 2 of 8 covered endpoints remain deferred under #570 because
// Qonto sandbox returns non-200 responses despite all card.write scopes
// being granted on the OAuth token (empirical 2026-05-12 re-probe via
// both CLI and MCP paths — `update-restrictions` flipped from 403 → 200
// and is now covered above):
//
//   - `card bulk-create`        → `POST /v2/cards/bulk`                 404 not_found
//     (precondition: docs/qonto-sandbox-preconditions.md#post-v2-cards-bulk)
//   - `card update-options`     → `PUT  /v2/cards/{id}/options`         403 Forbidden
//     (precondition: docs/qonto-sandbox-preconditions.md#put-v2-cards-id-options)
//
// Same sandbox-plan / admin-role pattern as the 4 deferred request
// endpoints in #555 (request approve/decline/create-flash-card/
// create-virtual-card all 403 with `request_*.write` scopes granted).
// Both CLI commands wrap with `executeWithCliSca` (verified by
// audit-refresh inspection of `packages/cli/src/commands/card/{bulk-create,
// update-options}.ts`), so the SCA path is structurally identical to the
// 6 covered endpoints above. Tracked under #570 as a follow-up to #556.
