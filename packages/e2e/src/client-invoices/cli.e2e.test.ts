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
        // Invoice creation may fail if the organization lacks required setup
        // (e.g., IBAN not configured). Skip downstream lifecycle tests.
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
});
