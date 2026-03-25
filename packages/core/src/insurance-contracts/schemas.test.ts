// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import {
  InsuranceContractSchema,
  InsuranceContractResponseSchema,
  InsuranceDocumentSchema,
  InsuranceDocumentResponseSchema,
} from "./schemas.js";

describe("InsuranceDocumentSchema", () => {
  const validDocument = {
    id: "doc-1",
    file_name: "policy.pdf",
    file_size: "12345",
    file_content_type: "application/pdf",
    url: "https://example.com/policy.pdf",
    created_at: "2025-06-01T00:00:00.000Z",
  };

  it("accepts a valid document", () => {
    const result = InsuranceDocumentSchema.parse(validDocument);
    expect(result).toEqual(validDocument);
  });

  it("coerces file_size to string", () => {
    const result = InsuranceDocumentSchema.parse({ ...validDocument, file_size: 12345 });
    expect(result.file_size).toBe("12345");
  });

  it("rejects missing required fields", () => {
    expect(() => InsuranceDocumentSchema.parse({ ...validDocument, id: undefined })).toThrow();
    expect(() => InsuranceDocumentSchema.parse({ ...validDocument, file_name: undefined })).toThrow();
    expect(() => InsuranceDocumentSchema.parse({ ...validDocument, url: undefined })).toThrow();
  });
});

describe("InsuranceDocumentResponseSchema", () => {
  it("validates response wrapper", () => {
    const response = {
      insurance_document: {
        id: "doc-1",
        file_name: "policy.pdf",
        file_size: "12345",
        file_content_type: "application/pdf",
        url: "https://example.com/policy.pdf",
        created_at: "2025-06-01T00:00:00.000Z",
      },
    };
    const result = InsuranceDocumentResponseSchema.parse(response);
    expect(result.insurance_document.id).toBe("doc-1");
  });
});

describe("InsuranceContractSchema", () => {
  const validContract = {
    id: "contract-1",
    insurance_type: "health",
    status: "active",
    provider_name: "Allianz",
    contract_number: "POL-12345",
    start_date: "2025-01-01",
    end_date: "2026-01-01",
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-06-01T00:00:00.000Z",
  };

  it("accepts a valid contract", () => {
    const result = InsuranceContractSchema.parse(validContract);
    expect(result).toEqual(validContract);
  });

  it("accepts null for nullable fields", () => {
    const result = InsuranceContractSchema.parse({
      ...validContract,
      contract_number: null,
      end_date: null,
    });
    expect(result.contract_number).toBeNull();
    expect(result.end_date).toBeNull();
  });

  it("rejects missing required fields", () => {
    expect(() => InsuranceContractSchema.parse({ ...validContract, id: undefined })).toThrow();
    expect(() => InsuranceContractSchema.parse({ ...validContract, insurance_type: undefined })).toThrow();
    expect(() => InsuranceContractSchema.parse({ ...validContract, start_date: undefined })).toThrow();
  });
});

describe("InsuranceContractResponseSchema", () => {
  it("validates response wrapper", () => {
    const response = {
      insurance_contract: {
        id: "contract-1",
        insurance_type: "health",
        status: "active",
        provider_name: "Allianz",
        contract_number: null,
        start_date: "2025-01-01",
        end_date: null,
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-06-01T00:00:00.000Z",
      },
    };
    const result = InsuranceContractResponseSchema.parse(response);
    expect(result.insurance_contract.id).toBe("contract-1");
  });
});
