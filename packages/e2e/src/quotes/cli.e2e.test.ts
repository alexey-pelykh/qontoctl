// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { QuoteSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli } from "../helpers.js";
import { hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

describe.skipIf(!hasOAuthCredentials())("quote commands (e2e)", () => {
  pinAuthPreference("oauth-first");

  describe("quote list", () => {
    it("lists quotes", () => {
      const output = cli("quote", "list");
      expect(output).toBeDefined();
    });

    it("produces valid JSON with --output json", () => {
      const output = cli("--output", "json", "quote", "list");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });

    it("supports --status filter", () => {
      const output = cli("--output", "json", "quote", "list", "--status", "pending_approval");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe("quote CRUD lifecycle", () => {
    let createdQuoteId: string | undefined;

    it("creates a quote", () => {
      const today = new Date().toISOString().split("T")[0] as string;
      const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      // First get a client ID — list existing quotes to extract one
      let quotes: { client: { id: string } }[];
      try {
        const listOutput = cli("--output", "json", "quote", "list");
        quotes = JSON.parse(listOutput) as { client: { id: string } }[];
      } catch {
        // API may return an error if no quotes exist in sandbox
        return;
      }
      if (quotes.length === 0) {
        // Cannot test create without a known client ID
        return;
      }

      const clientId = (quotes[0] as { client: { id: string } }).client.id;

      const body = JSON.stringify({
        client_id: clientId,
        issue_date: today,
        expiry_date: expiry,
        currency: "EUR",
        terms_and_conditions: "E2E test quote — safe to delete",
        items: [
          {
            title: "E2E Test Service",
            quantity: "1",
            unit_price: { value: "100.00", currency: "EUR" },
            vat_rate: "0.20",
          },
        ],
      });

      const output = cli("--output", "json", "quote", "create", "--body", body);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("status");
      createdQuoteId = parsed["id"] as string;
    });

    it("shows the created quote", () => {
      if (createdQuoteId === undefined) {
        return;
      }

      const output = cli("--output", "json", "quote", "show", createdQuoteId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      QuoteSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", createdQuoteId);
      expect(parsed).toHaveProperty("items");
    });

    it("updates the created quote", () => {
      if (createdQuoteId === undefined) {
        return;
      }

      const body = JSON.stringify({
        header: "Updated by E2E test",
      });

      const output = cli("--output", "json", "quote", "update", createdQuoteId, "--body", body);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", createdQuoteId);
    });

    it("deletes the created quote", () => {
      if (createdQuoteId === undefined) {
        return;
      }

      const output = cli("--output", "json", "quote", "delete", createdQuoteId, "--yes");
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("deleted", true);
    });
  });

  describe("quote delete without --yes", () => {
    it("exits with error when --yes is not provided", () => {
      try {
        cli("quote", "delete", "00000000-0000-0000-0000-000000000000");
        // Should not reach here
        expect.fail("Expected command to exit with non-zero code");
      } catch (error: unknown) {
        // execFileSync throws on non-zero exit code
        const execError = error as { status: number; stderr: Buffer };
        expect(execError.status).toBe(1);
      }
    });
  });

  describe("quote send (#638)", () => {
    // Since #638 the `quote send` command carries a typed `--to` / `--title`
    // payload that the Qonto API requires. Empirical probe (2026-05-22, see
    // PR #638 description): the API accepts the send regardless of the quote's
    // client mailbox state — the prior "client mailbox" precondition was an
    // artefact of the empty-body call shape. The previous try/catch that
    // absorbed any non-zero exit as a skip masked the historical 422/EOF
    // (#636 arm 1); the new triage surfaces any send failure as a test
    // failure. Sent quotes are not cleaned up here — the sandbox is reset
    // periodically.
    //
    // Parallel-endpoint cross-link (#643): The `client_invoice_send` test
    // (packages/e2e/src/client-invoices/{cli,mcp}.e2e.test.ts) targets the
    // parallel `POST /v2/client_invoices/{id}/send` endpoint, which accepts
    // the same OpenAPI `SendRequestPayload` shape. That test is structurally
    // different — env-gated via `QONTOCTL_E2E_SEND_EMAIL=true` AND retains a
    // defensive sandbox-precondition triage path — because (a) its parent
    // suite runs in CI's api-key context (vs this suite's OAuth-only parent
    // gate), and (b) the analogous empirical re-probe is blocked by
    // `client_invoice_create`'s invoicing-IBAN precondition (#539), leaving
    // the precondition status unverified on that side. See #643 for the
    // cross-endpoint reconciliation rationale.
    it("sends a draft quote end-to-end with --to + --title", () => {
      // Reuse an existing quote's client_id so we exercise the send path
      // against a real sandbox client.
      const listOutput = cli("--output", "json", "quote", "list");
      const quotes = JSON.parse(listOutput) as { client: { id: string } }[];
      if (quotes.length === 0) {
        // No clients in the sandbox to reuse — cannot construct a draft.
        // Surface as a skip via early return; sequential E2E execution means
        // this only fires when the sandbox is freshly empty.
        return;
      }

      const clientId = (quotes[0] as { client: { id: string } }).client.id;
      const today = new Date().toISOString().split("T")[0] as string;
      const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      const body = JSON.stringify({
        client_id: clientId,
        issue_date: today,
        expiry_date: expiry,
        currency: "EUR",
        terms_and_conditions: "E2E test quote — safe to delete",
        items: [
          {
            title: "E2E Test Service",
            quantity: "1",
            unit_price: { value: "100.00", currency: "EUR" },
            vat_rate: "0.20",
          },
        ],
      });

      const createOutput = cli("--output", "json", "quote", "create", "--body", body);
      const quoteId = (JSON.parse(createOutput) as { id: string }).id;

      // The send carries valid `send_to` + `email_title` per the Qonto
      // contract (#638). Failures here surface as test failures via
      // execFileSync's throw-on-non-zero behaviour — exactly the discipline
      // that caught #636 arm 1 once the masking try/catch was removed.
      const sendOutput = cli(
        "--output",
        "json",
        "quote",
        "send",
        quoteId,
        "--to",
        "e2e-recipient@example.com",
        "--title",
        "E2E test quote — safe to ignore",
        "--no-copy-self",
      );
      const parsed = JSON.parse(sendOutput) as Record<string, unknown>;
      expect(parsed).toHaveProperty("sent", true);
      expect(parsed).toHaveProperty("id", quoteId);
    });

    it("exits non-zero with stderr guidance when --to is missing (#638)", () => {
      try {
        cli("quote", "send", "00000000-0000-0000-0000-000000000000", "--title", "Subject");
        expect.fail("Expected command to exit with non-zero code");
      } catch (error: unknown) {
        const execError = error as { status: number; stderr: Buffer };
        expect(execError.status).toBe(1);
        expect(execError.stderr.toString()).toContain("--to");
      }
    });

    it("exits non-zero with stderr guidance when --title is missing (#638)", () => {
      try {
        cli("quote", "send", "00000000-0000-0000-0000-000000000000", "--to", "a@example.com");
        expect.fail("Expected command to exit with non-zero code");
      } catch (error: unknown) {
        const execError = error as { status: number; stderr: Buffer };
        expect(execError.status).toBe(1);
        expect(execError.stderr.toString()).toContain("--title");
      }
    });
  });
});
