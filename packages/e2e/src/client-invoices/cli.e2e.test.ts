// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { ClientInvoiceSchema, ClientInvoiceUploadSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli } from "../helpers.js";
import { hasApiKeyCredentials } from "../sandbox.js";

/**
 * Absolute path to the committed PDF fixture used by the upload round-trip.
 * Shared with attachments/insurance/supplier-invoice E2E.
 */
const PDF_FIXTURE_PATH = resolve(import.meta.dirname, "..", "..", "fixtures", "tiny.pdf");

describe.skipIf(!hasApiKeyCredentials())("client-invoice commands (e2e)", () => {
  describe("client-invoice list", () => {
    it("lists client invoices", () => {
      const output = cli("client-invoice", "list");
      expect(output).toBeDefined();
    });

    it("produces valid JSON with --output json", () => {
      const output = cli("--output", "json", "client-invoice", "list");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });

    it("supports --status filter", () => {
      const output = cli("--output", "json", "client-invoice", "list", "--status", "draft");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });

    // Guard for #544: the canonical Qonto status enum is
    // ["draft", "unpaid", "paid", "canceled"] — not ["draft", "pending", "paid",
    // "cancelled"]. Pre-#544 the CLI rejected `unpaid` at the commander layer
    // and accepted `pending` (which the API silently treats as no-match,
    // returning an empty page). This test asserts the canonical value passes
    // CLI validation AND the API accepts it.
    it("supports --status unpaid (canonical Qonto value)", () => {
      const output = cli("--output", "json", "client-invoice", "list", "--status", "unpaid");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe("client-invoice CRUD lifecycle", () => {
    let createdInvoiceId: string | undefined;

    it("creates a draft invoice", () => {
      // Get a client ID from existing clients
      const clientListOutput = cli("--output", "json", "client", "list");
      const clients = JSON.parse(clientListOutput) as { id: string }[];
      if (clients.length === 0) {
        return;
      }

      const clientId = (clients[0] as { id: string }).id;
      const today = new Date().toISOString().split("T")[0] as string;
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      const body = JSON.stringify({
        client_id: clientId,
        issue_date: today,
        due_date: dueDate,
        currency: "EUR",
        terms_and_conditions: "E2E test invoice — safe to delete",
        items: [
          {
            title: "E2E Test Service",
            quantity: "1",
            unit_price: { value: "100.00", currency: "EUR" },
            vat_rate: "20",
          },
        ],
      });

      try {
        const output = cli("--output", "json", "client-invoice", "create", "--body", body);
        const parsed = JSON.parse(output) as Record<string, unknown>;
        expect(parsed).toHaveProperty("id");
        expect(parsed).toHaveProperty("status", "draft");
        createdInvoiceId = parsed["id"] as string;
      } catch {
        // precondition: docs/qonto-sandbox-preconditions.md#post-v2-client-invoices
        // `client-invoice create` requires an org-level *invoicing IBAN*
        // (not the bank-account IBAN, and not `einvoicing.sending_status`)
        // that is not exposed by the public Qonto API. Without it the entire
        // write-path lifecycle (create → update → upload → finalize → send →
        // mark_paid → unmark_paid → cancel → delete) is unreachable, so
        // downstream tests below are silently skipped (createdInvoiceId stays
        // undefined). Tracked: [#539].
      }
    });

    it("shows the created invoice", () => {
      if (createdInvoiceId === undefined) {
        return;
      }

      const output = cli("--output", "json", "client-invoice", "show", createdInvoiceId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", createdInvoiceId);
      expect(parsed).toHaveProperty("items");
    });

    it("updates the created invoice", () => {
      if (createdInvoiceId === undefined) {
        return;
      }

      const body = JSON.stringify({
        header: "Updated by E2E test",
      });

      const output = cli("--output", "json", "client-invoice", "update", createdInvoiceId, "--body", body);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", createdInvoiceId);
    });

    // Real file upload + retrieval round-trip against the live sandbox — closes
    // the audit gap from umbrella #449 (Group 4c): client-invoice upload write
    // paths were fully implemented but uncovered by E2E. Sequential `it` blocks
    // share `uploadedFileId` via closure on top of the parent CRUD lifecycle's
    // `createdInvoiceId`, mirroring the attachment/insurance pattern in #453/#454.
    // The PDF fixture (`packages/e2e/fixtures/tiny.pdf`) landed with #G4A.
    //
    // Unlike attachments and insurance, the client-invoice upload endpoint has no
    // delete pair — uploads are removed implicitly when the parent invoice is
    // deleted in the final lifecycle step.
    let uploadedFileId: string | undefined;

    it("uploads a PDF to the created invoice via client-invoice upload", () => {
      if (createdInvoiceId === undefined) {
        return;
      }

      const output = cli("--output", "json", "client-invoice", "upload", createdInvoiceId, PDF_FIXTURE_PATH);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      ClientInvoiceUploadSchema.parse(parsed);
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("file_name", "tiny.pdf");
      expect(parsed).toHaveProperty("file_content_type");
      expect(parsed).toHaveProperty("file_size");
      uploadedFileId = parsed["id"] as string;
    });

    it("retrieves the upload via client-invoice upload-show", () => {
      if (createdInvoiceId === undefined || uploadedFileId === undefined) {
        return;
      }

      const output = cli("--output", "json", "client-invoice", "upload-show", createdInvoiceId, uploadedFileId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      ClientInvoiceUploadSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", uploadedFileId);
      expect(parsed).toHaveProperty("file_name", "tiny.pdf");
      expect(parsed).toHaveProperty("file_content_type");
      expect(parsed).toHaveProperty("url");
      expect(parsed).toHaveProperty("created_at");
    });

    it("deletes the created invoice", () => {
      if (createdInvoiceId === undefined) {
        return;
      }

      const output = cli("--output", "json", "client-invoice", "delete", createdInvoiceId, "--yes");
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("deleted", true);
    });
  });

  describe("client-invoice show", () => {
    it("shows an existing invoice", () => {
      const listOutput = cli("--output", "json", "client-invoice", "list");
      const invoices = JSON.parse(listOutput) as { id: string }[];
      if (invoices.length === 0) {
        return;
      }

      const invoiceId = (invoices[0] as { id: string }).id;
      const output = cli("--output", "json", "client-invoice", "show", invoiceId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      ClientInvoiceSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", invoiceId);
      expect(parsed).toHaveProperty("status");
    });
  });

  describe("client-invoice delete without --yes", () => {
    it("exits with error when --yes is not provided", () => {
      try {
        cli("client-invoice", "delete", "00000000-0000-0000-0000-000000000000");
        // Should not reach here
        expect.fail("Expected command to exit with non-zero code");
      } catch (error: unknown) {
        // execFileSync throws on non-zero exit code
        const execError = error as { status: number; stderr: Buffer };
        expect(execError.status).toBe(1);
      }
    });
  });

  // State-machine E2E for non-SCA write paths — closes #457 (umbrella #449
  // Group 5). The state machine is:
  //
  //   create (draft) → finalize (draft → unpaid) → mark-paid (unpaid → paid)
  //     → unmark-paid (paid → unpaid) → cancel (unpaid → canceled, terminal)
  //
  // Each transition is a separate `it` so a failure localizes to the broken
  // transition rather than cascading through the whole lifecycle. The
  // closure-shared `lifecycleInvoiceId` mirrors the CRUD lifecycle and upload
  // round-trip patterns above; downstream transitions early-return when an
  // upstream step failed (sandbox/prod orgs without a usable client + IBAN
  // skip the entire chain gracefully).
  //
  // Cancellation is terminal — Qonto does not let the test reverse it, and
  // canceled invoices cannot be deleted (delete is draft-only). Each
  // successful run therefore leaves one canceled invoice in the test org.
  // This is the explicit price of live state-machine coverage; the umbrella
  // (#449 Group 5) accepted this trade-off in the original AC.
  //
  // The `send` path (AC #3) is exercised in a separate, env-var-gated block
  // below — it requires email-safe sandbox config that the default test org
  // does not necessarily provide.
  describe("client-invoice lifecycle state transitions (#457)", () => {
    let lifecycleInvoiceId: string | undefined;

    it("creates a draft invoice as the lifecycle entry point", () => {
      const clientListOutput = cli("--output", "json", "client", "list");
      const clients = JSON.parse(clientListOutput) as { id: string }[];
      if (clients.length === 0) {
        return;
      }

      const clientId = (clients[0] as { id: string }).id;
      const today = new Date().toISOString().split("T")[0] as string;
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      const body = JSON.stringify({
        client_id: clientId,
        issue_date: today,
        due_date: dueDate,
        currency: "EUR",
        terms_and_conditions: "E2E #457 lifecycle test — safe to delete",
        items: [
          {
            title: "E2E Lifecycle Test Service",
            quantity: "1",
            unit_price: { value: "100.00", currency: "EUR" },
            vat_rate: "20",
          },
        ],
      });

      try {
        const output = cli("--output", "json", "client-invoice", "create", "--body", body);
        const parsed = JSON.parse(output) as Record<string, unknown>;
        const invoice = ClientInvoiceSchema.parse(parsed);
        expect(invoice.status).toBe("draft");
        lifecycleInvoiceId = invoice.id;
      } catch {
        // Org may lack a usable client + IBAN — skip the lifecycle.
      }
    });

    it("transitions draft → unpaid via finalize", () => {
      if (lifecycleInvoiceId === undefined) {
        return;
      }

      const output = cli("--output", "json", "client-invoice", "finalize", lifecycleInvoiceId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      const invoice = ClientInvoiceSchema.parse(parsed);
      expect(invoice.id).toBe(lifecycleInvoiceId);
      expect(invoice.status).toBe("unpaid");
      // Finalize assigns the invoice number — pre-finalize this is null.
      expect(invoice.invoice_number).not.toBeNull();
    });

    it("transitions unpaid → paid via mark-paid", () => {
      if (lifecycleInvoiceId === undefined) {
        return;
      }

      const output = cli("--output", "json", "client-invoice", "mark-paid", lifecycleInvoiceId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      const invoice = ClientInvoiceSchema.parse(parsed);
      expect(invoice.id).toBe(lifecycleInvoiceId);
      expect(invoice.status).toBe("paid");
    });

    it("transitions paid → unpaid via unmark-paid", () => {
      if (lifecycleInvoiceId === undefined) {
        return;
      }

      const output = cli("--output", "json", "client-invoice", "unmark-paid", lifecycleInvoiceId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      const invoice = ClientInvoiceSchema.parse(parsed);
      expect(invoice.id).toBe(lifecycleInvoiceId);
      expect(invoice.status).toBe("unpaid");
    });

    it("transitions unpaid → canceled via cancel (terminal)", () => {
      if (lifecycleInvoiceId === undefined) {
        return;
      }

      const output = cli("--output", "json", "client-invoice", "cancel", lifecycleInvoiceId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      const invoice = ClientInvoiceSchema.parse(parsed);
      expect(invoice.id).toBe(lifecycleInvoiceId);
      expect(invoice.status).toBe("canceled");
      // Terminal state — no cleanup; canceled invoices cannot be deleted.
    });
  });

  // AC #3 of #457: `client-invoice send` is a separate path that requires
  // email-safe sandbox config (a test client with a no-bounce mailbox).
  // Skipped by default; opt in via `QONTOCTL_E2E_SEND_EMAIL=true`. When
  // enabled, exercises create → finalize → send → cancel (cleanup); the
  // send is the assertion under test, the surrounding lifecycle is
  // scaffolding to reach a sendable state.
  describe.skipIf(process.env["QONTOCTL_E2E_SEND_EMAIL"] !== "true")(
    "client-invoice send (#457 AC #3, opt-in via QONTOCTL_E2E_SEND_EMAIL=true)",
    () => {
      let sendInvoiceId: string | undefined;

      it("creates a draft invoice as a send precondition", () => {
        const clientListOutput = cli("--output", "json", "client", "list");
        const clients = JSON.parse(clientListOutput) as { id: string }[];
        if (clients.length === 0) {
          return;
        }

        const clientId = (clients[0] as { id: string }).id;
        const today = new Date().toISOString().split("T")[0] as string;
        const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

        const body = JSON.stringify({
          client_id: clientId,
          issue_date: today,
          due_date: dueDate,
          currency: "EUR",
          terms_and_conditions: "E2E #457 send test — safe to delete",
          items: [
            {
              title: "E2E Send Test Service",
              quantity: "1",
              unit_price: { value: "100.00", currency: "EUR" },
              vat_rate: "20",
            },
          ],
        });

        try {
          const output = cli("--output", "json", "client-invoice", "create", "--body", body);
          const parsed = JSON.parse(output) as Record<string, unknown>;
          expect(parsed).toHaveProperty("id");
          expect(parsed).toHaveProperty("status", "draft");
          sendInvoiceId = parsed["id"] as string;
        } catch {
          // Org may lack a usable client + IBAN — skip the send.
        }
      });

      it("finalizes the draft to make it sendable", () => {
        if (sendInvoiceId === undefined) {
          return;
        }

        const output = cli("--output", "json", "client-invoice", "finalize", sendInvoiceId);
        const parsed = JSON.parse(output) as Record<string, unknown>;
        expect(parsed).toHaveProperty("id", sendInvoiceId);
        expect(parsed).toHaveProperty("status", "unpaid");
      });

      it("sends the finalized invoice to the client via email", () => {
        if (sendInvoiceId === undefined) {
          return;
        }

        const output = cli("--output", "json", "client-invoice", "send", sendInvoiceId);
        const parsed = JSON.parse(output) as Record<string, unknown>;
        expect(parsed).toHaveProperty("sent", true);
        expect(parsed).toHaveProperty("id", sendInvoiceId);
      });

      it("cancels the sent invoice (cleanup)", () => {
        if (sendInvoiceId === undefined) {
          return;
        }

        const output = cli("--output", "json", "client-invoice", "cancel", sendInvoiceId);
        const parsed = JSON.parse(output) as Record<string, unknown>;
        expect(parsed).toHaveProperty("id", sendInvoiceId);
        expect(parsed).toHaveProperty("status", "canceled");
      });
    },
  );

  // Regression for #575: Qonto returns `items: null` for drafts with no line
  // items. Pre-fix, `client-invoice show` blew up with a Zod validation error
  // on any such draft. This test creates an empty-items draft and shows it,
  // exercising the schema-boundary normalization end-to-end through the CLI.
  describe("client-invoice show empty-items draft (regression: #575)", () => {
    let emptyDraftId: string | undefined;

    it("creates a draft with no line items", () => {
      // Get a client ID from existing clients
      const clientListOutput = cli("--output", "json", "client", "list");
      const clients = JSON.parse(clientListOutput) as { id: string }[];
      if (clients.length === 0) {
        return;
      }

      const clientId = (clients[0] as { id: string }).id;
      const today = new Date().toISOString().split("T")[0] as string;
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      const body = JSON.stringify({
        client_id: clientId,
        issue_date: today,
        due_date: dueDate,
        currency: "EUR",
        terms_and_conditions: "E2E #575 empty-items draft — safe to delete",
        items: [],
      });

      try {
        const output = cli("--output", "json", "client-invoice", "create", "--body", body);
        const parsed = JSON.parse(output) as Record<string, unknown>;
        expect(parsed).toHaveProperty("id");
        expect(parsed).toHaveProperty("status", "draft");
        emptyDraftId = parsed["id"] as string;
      } catch {
        // precondition: docs/qonto-sandbox-preconditions.md#post-v2-client-invoices
        // Same blocker as the parent CRUD lifecycle: `client-invoice create`
        // is gated on an org-level invoicing-IBAN configuration. On orgs
        // where that setting is missing the API rejects with HTTP 422
        // `invalid_iban: IBAN is empty` before any items-shape validation
        // runs, so the empty-items round trip is silently skipped here.
        // The schema fix from #575 is still exercised by the unit tests in
        // `packages/core/src/client-invoices/schemas.test.ts`
        // (`normalizes items: null to []` and siblings).
      }
    });

    it("shows the empty-items draft and round-trips items as []", () => {
      if (emptyDraftId === undefined) {
        return;
      }

      const output = cli("--output", "json", "client-invoice", "show", emptyDraftId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      // Round-trip via the full schema — this is what blew up pre-#575.
      const invoice = ClientInvoiceSchema.parse(parsed);
      expect(invoice.id).toBe(emptyDraftId);
      // Post-transform: API `null` is exposed to consumers as `[]`.
      expect(invoice.items).toEqual([]);
    });

    it("cleans up the empty-items draft", () => {
      if (emptyDraftId === undefined) {
        return;
      }

      const output = cli("--output", "json", "client-invoice", "delete", emptyDraftId, "--yes");
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("deleted", true);
    });
  });
});
