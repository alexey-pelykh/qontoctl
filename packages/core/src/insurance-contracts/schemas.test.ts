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
    name: "ProLiability Plan 2026",
    contract_id: "POL-12345",
    origin: "qonto_other",
    provider_slug: "axa",
    type: "business_liability",
    status: "active",
    payment_frequency: "annual",
    price: { value: "99.99", currency: "EUR" },
    start_date: "2026-01-01",
    expiration_date: "2027-01-01",
  };

  it("accepts a valid contract", () => {
    const result = InsuranceContractSchema.parse(validContract);
    expect(result).toEqual(validContract);
  });

  it("accepts a minimal contract (omitting all optional fields)", () => {
    const minimal = {
      id: "contract-1",
      name: "ProLiability Plan 2026",
      contract_id: "POL-12345",
      origin: "qonto_other",
      provider_slug: "axa",
      type: "business_liability",
      status: "active",
      payment_frequency: "annual",
      price: { value: "99.99", currency: "EUR" },
    };
    const result = InsuranceContractSchema.parse(minimal);
    expect(result.id).toBe("contract-1");
    expect(result.start_date).toBeUndefined();
    expect(result.expiration_date).toBeUndefined();
  });

  it("accepts null for nullable date and URL fields", () => {
    const withNulls = {
      id: "contract-1",
      name: "ProLiability Plan 2026",
      contract_id: "POL-12345",
      origin: "qonto_other",
      provider_slug: "axa",
      type: "business_liability",
      status: "active",
      payment_frequency: "annual",
      price: { value: "99.99", currency: "EUR" },
      start_date: null,
      expiration_date: null,
      renewal_date: null,
      service_url: null,
      troubleshooting_url: null,
    };
    const result = InsuranceContractSchema.parse(withNulls);
    expect(result.expiration_date).toBeNull();
    expect(result.renewal_date).toBeNull();
    expect(result.service_url).toBeNull();
    expect(result.troubleshooting_url).toBeNull();
  });

  it("accepts all known origin enum values", () => {
    for (const origin of ["insurance_hub", "qonto_other", "stello"] as const) {
      expect(() => InsuranceContractSchema.parse({ ...validContract, origin })).not.toThrow();
    }
  });

  it("rejects unknown origin values", () => {
    expect(() => InsuranceContractSchema.parse({ ...validContract, origin: "unknown_source" })).toThrow();
  });

  it("accepts all known status enum values", () => {
    for (const status of [
      "active",
      "pending_payment",
      "pending_others",
      "action_required",
      "expired",
      "archived",
    ] as const) {
      expect(() => InsuranceContractSchema.parse({ ...validContract, status })).not.toThrow();
    }
  });

  it("rejects unknown status values", () => {
    expect(() => InsuranceContractSchema.parse({ ...validContract, status: "draft" })).toThrow();
  });

  it("accepts all known payment_frequency values", () => {
    for (const payment_frequency of ["month", "quarter", "semester", "annual"] as const) {
      expect(() => InsuranceContractSchema.parse({ ...validContract, payment_frequency })).not.toThrow();
    }
  });

  it("rejects unknown payment_frequency values", () => {
    expect(() => InsuranceContractSchema.parse({ ...validContract, payment_frequency: "weekly" })).toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() => InsuranceContractSchema.parse({ ...validContract, id: undefined })).toThrow();
    expect(() => InsuranceContractSchema.parse({ ...validContract, name: undefined })).toThrow();
    expect(() => InsuranceContractSchema.parse({ ...validContract, contract_id: undefined })).toThrow();
    expect(() => InsuranceContractSchema.parse({ ...validContract, origin: undefined })).toThrow();
    expect(() => InsuranceContractSchema.parse({ ...validContract, provider_slug: undefined })).toThrow();
    expect(() => InsuranceContractSchema.parse({ ...validContract, type: undefined })).toThrow();
    expect(() => InsuranceContractSchema.parse({ ...validContract, status: undefined })).toThrow();
    expect(() => InsuranceContractSchema.parse({ ...validContract, payment_frequency: undefined })).toThrow();
    expect(() => InsuranceContractSchema.parse({ ...validContract, price: undefined })).toThrow();
  });

  it("accepts a documents array on the contract", () => {
    const withDocs = {
      ...validContract,
      documents: [{ id: "doc-1", name: "policy.pdf", type: "contract" }],
    };
    const result = InsuranceContractSchema.parse(withDocs);
    expect(result.documents).toHaveLength(1);
    expect(result.documents?.[0]?.id).toBe("doc-1");
  });

  it("strips unknown fields", () => {
    const result = InsuranceContractSchema.parse({
      ...validContract,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z",
      undocumented_field: "ignored",
    } as unknown);
    expect(result).not.toHaveProperty("created_at");
    expect(result).not.toHaveProperty("updated_at");
    expect(result).not.toHaveProperty("undocumented_field");
  });
});

describe("InsuranceContractResponseSchema", () => {
  it("validates response wrapper", () => {
    const response = {
      insurance_contract: {
        id: "contract-1",
        name: "ProLiability Plan 2026",
        contract_id: "POL-12345",
        origin: "qonto_other",
        provider_slug: "axa",
        type: "business_liability",
        status: "active",
        payment_frequency: "annual",
        price: { value: "99.99", currency: "EUR" },
      },
    };
    const result = InsuranceContractResponseSchema.parse(response);
    expect(result.insurance_contract.id).toBe("contract-1");
  });
});
