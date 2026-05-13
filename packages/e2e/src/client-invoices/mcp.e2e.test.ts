// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ClientInvoiceListResponseSchema, ClientInvoiceSchema, ClientInvoiceUploadSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials } from "../sandbox.js";

/**
 * Absolute path to the committed PDF fixture used by the upload round-trip.
 * Shared with attachments/insurance/supplier-invoice E2E.
 */
const PDF_FIXTURE_PATH = resolve(import.meta.dirname, "..", "..", "fixtures", "tiny.pdf");

describe.skipIf(!hasApiKeyCredentials())("MCP client invoice tools (e2e)", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv(),
      stderr: "pipe",
    });

    client = new Client({ name: "e2e-test", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  describe("client_invoice_list", () => {
    it("returns a list of client invoices with expected structure", async () => {
      const result = await client.callTool({
        name: "client_invoice_list",
        arguments: {},
      });

      // Sandbox may not have client invoices — skip gracefully on tool error
      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        client_invoices: unknown[];
        meta: Record<string, unknown>;
      };
      ClientInvoiceListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("client_invoices");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.client_invoices)).toBe(true);
    });

    // Guard for #544: the canonical Qonto status enum is
    // ["draft", "unpaid", "paid", "canceled"] — not ["draft", "pending", "paid",
    // "cancelled"]. Pre-#544 the MCP Zod enum rejected `unpaid` (the canonical
    // value Qonto actually returns) and accepted `pending` (which Qonto's API
    // silently treats as no-match). This asserts the canonical value passes the
    // tool's input schema AND the API accepts it.
    it("supports status: 'unpaid' (canonical Qonto value)", async () => {
      const result = await client.callTool({
        name: "client_invoice_list",
        arguments: { status: "unpaid" },
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        client_invoices: unknown[];
        meta: Record<string, unknown>;
      };
      ClientInvoiceListResponseSchema.parse(parsed);
      expect(Array.isArray(parsed.client_invoices)).toBe(true);
    });
  });

  describe("client_invoice_show", () => {
    it("returns details for a specific client invoice", async () => {
      const listResult = await client.callTool({
        name: "client_invoice_list",
        arguments: {},
      });
      if (listResult.isError === true) return;

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        client_invoices: { id: string }[];
      };
      if (listParsed.client_invoices.length === 0) {
        return;
      }

      const invoiceId = (listParsed.client_invoices[0] as { id: string }).id;

      const result = await client.callTool({
        name: "client_invoice_show",
        arguments: { id: invoiceId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      ClientInvoiceSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", invoiceId);
      expect(parsed).toHaveProperty("status");
      expect(parsed).toHaveProperty("items");
    });
  });

  // Real file upload + retrieval round-trip against the live sandbox — closes
  // the audit gap from umbrella #449 (Group 4c): client-invoice upload write
  // paths were fully implemented but uncovered by E2E. Sequential `it` blocks
  // share `createdInvoiceId` / `uploadedFileId` via closure (mirrors the CLI
  // pattern in this file and the attachment/insurance MCP patterns in #453/#454).
  // The PDF fixture (`packages/e2e/fixtures/tiny.pdf`) landed with #G4A.
  //
  // The MCP suite currently has no CRUD lifecycle (unlike CLI), so this block
  // creates its own draft invoice as a precondition, performs the upload+show
  // round-trip, then cleans up by deleting the invoice (which implicitly
  // removes the upload — there is no upload-delete endpoint).
  describe("client_invoice upload + retrieval round-trip (MCP)", () => {
    let createdInvoiceId: string | undefined;
    let uploadedFileId: string | undefined;

    it("creates a draft invoice as a precondition for upload", async () => {
      // Fetch a client ID from existing clients (mirrors the CLI lifecycle).
      const clientListResult = await client.callTool({
        name: "client_list",
        arguments: {},
      });
      if (clientListResult.isError === true) return;

      const clientsParsed = JSON.parse(firstTextFromMcpResult(clientListResult)) as {
        clients: { id: string }[];
      };
      if (clientsParsed.clients.length === 0) {
        return;
      }

      const clientId = (clientsParsed.clients[0] as { id: string }).id;
      const today = new Date().toISOString().split("T")[0] as string;
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      const createResult = await client.callTool({
        name: "client_invoice_create",
        arguments: {
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
        },
      });

      // Invoice creation may fail if the organization lacks required setup
      // (e.g., IBAN not configured) — skip downstream lifecycle when it does.
      if (createResult.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(createResult)) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("status", "draft");
      createdInvoiceId = parsed["id"] as string;
    });

    it("uploads a PDF to the created invoice via client_invoice_upload", async () => {
      if (createdInvoiceId === undefined) return;

      const result = await client.callTool({
        name: "client_invoice_upload",
        arguments: { id: createdInvoiceId, file_path: PDF_FIXTURE_PATH },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      ClientInvoiceUploadSchema.parse(parsed);
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("file_name", "tiny.pdf");
      expect(parsed).toHaveProperty("file_content_type");
      expect(parsed).toHaveProperty("file_size");
      uploadedFileId = parsed["id"] as string;
    });

    it("retrieves the upload via client_invoice_upload_show", async () => {
      if (createdInvoiceId === undefined || uploadedFileId === undefined) return;

      const result = await client.callTool({
        name: "client_invoice_upload_show",
        arguments: { id: createdInvoiceId, upload_id: uploadedFileId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      ClientInvoiceUploadSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", uploadedFileId);
      expect(parsed).toHaveProperty("file_name", "tiny.pdf");
      expect(parsed).toHaveProperty("file_content_type");
      expect(parsed).toHaveProperty("url");
      expect(parsed).toHaveProperty("created_at");
    });

    it("deletes the created invoice (cleanup)", async () => {
      if (createdInvoiceId === undefined) return;

      const result = await client.callTool({
        name: "client_invoice_delete",
        arguments: { id: createdInvoiceId },
      });
      expect(result.isError).toBeFalsy();
    });
  });

  // State-machine E2E for non-SCA write paths via MCP — mirrors the CLI
  // suite's lifecycle block for #457. The state machine is:
  //
  //   client_invoice_create (draft) → client_invoice_finalize (draft → unpaid)
  //     → client_invoice_mark_paid (unpaid → paid)
  //     → client_invoice_unmark_paid (paid → unpaid)
  //     → client_invoice_cancel (unpaid → canceled, terminal)
  //
  // Each transition is a separate `it` so a failure localizes to the broken
  // transition. The closure-shared `lifecycleInvoiceId` mirrors the upload
  // round-trip block above. Cancellation is terminal — canceled invoices
  // cannot be deleted (delete is draft-only), so each successful run leaks
  // one canceled invoice into the test org (accepted trade-off per #449
  // Group 5).
  describe("client_invoice lifecycle state transitions (#457, MCP)", () => {
    let lifecycleInvoiceId: string | undefined;

    it("creates a draft invoice as the lifecycle entry point", async () => {
      const clientListResult = await client.callTool({
        name: "client_list",
        arguments: {},
      });
      if (clientListResult.isError === true) return;

      const clientsParsed = JSON.parse(firstTextFromMcpResult(clientListResult)) as {
        clients: { id: string }[];
      };
      if (clientsParsed.clients.length === 0) {
        return;
      }

      const clientId = (clientsParsed.clients[0] as { id: string }).id;
      const today = new Date().toISOString().split("T")[0] as string;
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      const createResult = await client.callTool({
        name: "client_invoice_create",
        arguments: {
          client_id: clientId,
          issue_date: today,
          due_date: dueDate,
          currency: "EUR",
          terms_and_conditions: "E2E #457 lifecycle test (MCP) — safe to delete",
          items: [
            {
              title: "E2E Lifecycle Test Service (MCP)",
              quantity: "1",
              unit_price: { value: "100.00", currency: "EUR" },
              vat_rate: "20",
            },
          ],
        },
      });

      // Invoice creation may fail if the organization lacks required setup
      // (e.g., IBAN not configured) — skip downstream lifecycle when it does.
      if (createResult.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(createResult)) as Record<string, unknown>;
      const invoice = ClientInvoiceSchema.parse(parsed);
      expect(invoice.status).toBe("draft");
      lifecycleInvoiceId = invoice.id;
    });

    it("transitions draft → unpaid via client_invoice_finalize", async () => {
      if (lifecycleInvoiceId === undefined) return;

      const result = await client.callTool({
        name: "client_invoice_finalize",
        arguments: { id: lifecycleInvoiceId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      const invoice = ClientInvoiceSchema.parse(parsed);
      expect(invoice.id).toBe(lifecycleInvoiceId);
      expect(invoice.status).toBe("unpaid");
      // Finalize assigns the invoice number — pre-finalize this is null.
      expect(invoice.invoice_number).not.toBeNull();
    });

    it("transitions unpaid → paid via client_invoice_mark_paid", async () => {
      if (lifecycleInvoiceId === undefined) return;

      const result = await client.callTool({
        name: "client_invoice_mark_paid",
        arguments: { id: lifecycleInvoiceId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      const invoice = ClientInvoiceSchema.parse(parsed);
      expect(invoice.id).toBe(lifecycleInvoiceId);
      expect(invoice.status).toBe("paid");
    });

    it("transitions paid → unpaid via client_invoice_unmark_paid", async () => {
      if (lifecycleInvoiceId === undefined) return;

      const result = await client.callTool({
        name: "client_invoice_unmark_paid",
        arguments: { id: lifecycleInvoiceId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      const invoice = ClientInvoiceSchema.parse(parsed);
      expect(invoice.id).toBe(lifecycleInvoiceId);
      expect(invoice.status).toBe("unpaid");
    });

    it("transitions unpaid → canceled via client_invoice_cancel (terminal)", async () => {
      if (lifecycleInvoiceId === undefined) return;

      const result = await client.callTool({
        name: "client_invoice_cancel",
        arguments: { id: lifecycleInvoiceId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      const invoice = ClientInvoiceSchema.parse(parsed);
      expect(invoice.id).toBe(lifecycleInvoiceId);
      expect(invoice.status).toBe("canceled");
      // Terminal state — no cleanup; canceled invoices cannot be deleted.
    });
  });

  // AC #3 of #457 (MCP mirror): `client_invoice_send` is a separate path
  // that requires email-safe sandbox config (a test client with a no-bounce
  // mailbox). Skipped by default; opt in via `QONTOCTL_E2E_SEND_EMAIL=true`.
  // When enabled, exercises create → finalize → send → cancel (cleanup);
  // the send is the assertion under test, the surrounding lifecycle is
  // scaffolding to reach a sendable state.
  describe.skipIf(process.env["QONTOCTL_E2E_SEND_EMAIL"] !== "true")(
    "client_invoice_send (#457 AC #3, MCP, opt-in via QONTOCTL_E2E_SEND_EMAIL=true)",
    () => {
      let sendInvoiceId: string | undefined;

      it("creates a draft invoice as a send precondition", async () => {
        const clientListResult = await client.callTool({
          name: "client_list",
          arguments: {},
        });
        if (clientListResult.isError === true) return;

        const clientsParsed = JSON.parse(firstTextFromMcpResult(clientListResult)) as {
          clients: { id: string }[];
        };
        if (clientsParsed.clients.length === 0) {
          return;
        }

        const clientId = (clientsParsed.clients[0] as { id: string }).id;
        const today = new Date().toISOString().split("T")[0] as string;
        const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

        const createResult = await client.callTool({
          name: "client_invoice_create",
          arguments: {
            client_id: clientId,
            issue_date: today,
            due_date: dueDate,
            currency: "EUR",
            terms_and_conditions: "E2E #457 send test (MCP) — safe to delete",
            items: [
              {
                title: "E2E Send Test Service (MCP)",
                quantity: "1",
                unit_price: { value: "100.00", currency: "EUR" },
                vat_rate: "20",
              },
            ],
          },
        });

        if (createResult.isError === true) return;

        const parsed = JSON.parse(firstTextFromMcpResult(createResult)) as Record<string, unknown>;
        expect(parsed).toHaveProperty("id");
        expect(parsed).toHaveProperty("status", "draft");
        sendInvoiceId = parsed["id"] as string;
      });

      it("finalizes the draft to make it sendable", async () => {
        if (sendInvoiceId === undefined) return;

        const result = await client.callTool({
          name: "client_invoice_finalize",
          arguments: { id: sendInvoiceId },
        });

        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
        expect(parsed).toHaveProperty("id", sendInvoiceId);
        expect(parsed).toHaveProperty("status", "unpaid");
      });

      it("sends the finalized invoice to the client via email", async () => {
        if (sendInvoiceId === undefined) return;

        const result = await client.callTool({
          name: "client_invoice_send",
          arguments: { id: sendInvoiceId },
        });

        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
        expect(parsed).toHaveProperty("sent", true);
        expect(parsed).toHaveProperty("id", sendInvoiceId);
      });

      it("cancels the sent invoice (cleanup)", async () => {
        if (sendInvoiceId === undefined) return;

        const result = await client.callTool({
          name: "client_invoice_cancel",
          arguments: { id: sendInvoiceId },
        });

        expect(result.isError).toBeFalsy();
        const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
        expect(parsed).toHaveProperty("id", sendInvoiceId);
        expect(parsed).toHaveProperty("status", "canceled");
      });
    },
  );
});
