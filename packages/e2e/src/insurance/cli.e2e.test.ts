// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { InsuranceContractSchema, InsuranceDocumentSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli } from "../helpers.js";
import { hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

/**
 * Absolute path to the committed PDF fixture used by the document upload
 * round-trip. Shared with attachments/client-invoice/supplier-invoice E2E.
 */
const PDF_FIXTURE_PATH = resolve(import.meta.dirname, "..", "..", "fixtures", "tiny.pdf");

interface InsuranceDocumentRef {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

describe.skipIf(!hasOAuthCredentials())("insurance CLI commands (e2e)", () => {
  pinAuthPreference("oauth-first");

  describe("insurance CRUD lifecycle", () => {
    let createdId: string | undefined;

    it("creates an insurance contract", () => {
      const output = cli(
        "--output",
        "json",
        "insurance",
        "create",
        "--name",
        "E2E ProLiability Plan",
        "--contract-id",
        `e2e-cli-${Date.now()}`,
        "--origin",
        "qonto_other",
        "--provider-slug",
        "axa",
        "--type",
        "professional_liability",
        "--status",
        "active",
        "--payment-frequency",
        "annual",
        "--price-value",
        "99.99",
        "--price-currency",
        "EUR",
        "--start-date",
        "2026-01-01",
      );
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("type", "professional_liability");
      expect(parsed).toHaveProperty("provider_slug", "axa");
      InsuranceContractSchema.parse(parsed);
      createdId = parsed["id"] as string;
    });

    it("shows the created insurance contract", () => {
      if (createdId === undefined) return;

      const output = cli("--output", "json", "insurance", "show", createdId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      InsuranceContractSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", createdId);
    });

    it("updates the created insurance contract", () => {
      if (createdId === undefined) return;

      const output = cli("--output", "json", "insurance", "update", createdId, "--provider-slug", "allianz");
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", createdId);
      expect(parsed).toHaveProperty("provider_slug", "allianz");
    });

    // Real document upload + delete round-trip against the live sandbox — closes
    // the audit gap from umbrella #449 (Group 4b): insurance document write
    // paths were fully implemented but uncovered by E2E. Reuses the `createdId`
    // closure variable from the CRUD lifecycle above so the contract is shared
    // across the suite (mirrors the attachment pattern in #453). The PDF
    // fixture (`packages/e2e/fixtures/tiny.pdf`) landed with #G4A.
    let uploadedDocId: string | undefined;

    it("uploads a document via insurance upload-doc", () => {
      if (createdId === undefined) return;

      // `--type` is required by the Qonto API (one of contract, amendment,
      // invoice, other, policy, certificate — empirically observed values).
      const output = cli(
        "--output",
        "json",
        "insurance",
        "upload-doc",
        createdId,
        PDF_FIXTURE_PATH,
        "--type",
        "contract",
      );
      const parsed = JSON.parse(output) as Record<string, unknown>;
      InsuranceDocumentSchema.parse(parsed);
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("name", "tiny.pdf");
      expect(parsed).toHaveProperty("type", "contract");
      uploadedDocId = parsed["id"] as string;
    });

    it("insurance show reflects the uploaded document", () => {
      if (createdId === undefined || uploadedDocId === undefined) return;

      const output = cli("--output", "json", "insurance", "show", createdId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      InsuranceContractSchema.parse(parsed);
      const documents = (parsed["documents"] as readonly InsuranceDocumentRef[] | null | undefined) ?? [];
      expect(documents.map((d) => d.id)).toContain(uploadedDocId);
    });

    it("removes the document via insurance remove-doc --yes", () => {
      if (createdId === undefined || uploadedDocId === undefined) return;

      // `--yes` is required: without it, the CLI prints a confirmation prompt
      // to stderr and exits 1 (see `packages/cli/src/commands/insurance.ts`).
      cli("--output", "json", "insurance", "remove-doc", createdId, uploadedDocId, "--yes");

      const output = cli("--output", "json", "insurance", "show", createdId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      const documents = (parsed["documents"] as readonly InsuranceDocumentRef[] | null | undefined) ?? [];
      expect(documents.map((d) => d.id)).not.toContain(uploadedDocId);
    });
  });
});
