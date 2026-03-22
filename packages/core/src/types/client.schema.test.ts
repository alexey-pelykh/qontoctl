// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { ClientAddressSchema, ClientSchema } from "./client.schema.js";

describe("ClientAddressSchema", () => {
  const validAddress = {
    street_address: "123 Main St",
    city: "Paris",
    zip_code: "75001",
    province_code: null,
    country_code: "FR",
  };

  it("parses a valid address", () => {
    const result = ClientAddressSchema.parse(validAddress);
    expect(result).toEqual(validAddress);
  });

  it("parses with all nullable fields set to null", () => {
    const result = ClientAddressSchema.parse({
      street_address: null,
      city: null,
      zip_code: null,
      province_code: null,
      country_code: null,
    });
    expect(result.street_address).toBeNull();
  });

  it("strips unknown fields", () => {
    const result = ClientAddressSchema.parse({ ...validAddress, extra: true });
    expect(result).not.toHaveProperty("extra");
  });
});

describe("ClientSchema", () => {
  const validClient = {
    id: "client-1",
    name: "ACME Corp",
    first_name: null,
    last_name: null,
    kind: "company" as const,
    email: "contact@acme.com",
    vat_number: "FR12345678901",
    tax_identification_number: null,
    address: "123 Main St",
    city: "Paris",
    zip_code: "75001",
    province_code: null,
    country_code: "FR",
    billing_address: {
      street_address: "123 Main St",
      city: "Paris",
      zip_code: "75001",
      province_code: null,
      country_code: "FR",
    },
    delivery_address: null,
    locale: "fr",
    currency: "EUR",
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-06-15T12:00:00.000Z",
  };

  it("parses a valid client", () => {
    const result = ClientSchema.parse(validClient);
    expect(result).toEqual(validClient);
  });

  it("validates kind enum values", () => {
    for (const kind of ["company", "individual", "freelancer"]) {
      expect(() => ClientSchema.parse({ ...validClient, kind })).not.toThrow();
    }
    expect(() => ClientSchema.parse({ ...validClient, kind: "other" })).toThrow();
  });

  it("strips unknown fields from client and nested address", () => {
    const result = ClientSchema.parse({
      ...validClient,
      extra: true,
      billing_address: { ...validClient.billing_address, extra: true },
    });
    expect(result).not.toHaveProperty("extra");
    expect(result.billing_address).not.toHaveProperty("extra");
  });

  it("accepts all nullable fields set to null", () => {
    const result = ClientSchema.parse({
      ...validClient,
      name: null,
      first_name: null,
      last_name: null,
      email: null,
      vat_number: null,
      tax_identification_number: null,
      address: null,
      city: null,
      zip_code: null,
      province_code: null,
      country_code: null,
      billing_address: null,
      delivery_address: null,
      locale: null,
      currency: null,
    });
    expect(result.name).toBeNull();
    expect(result.email).toBeNull();
    expect(result.vat_number).toBeNull();
    expect(result.address).toBeNull();
    expect(result.city).toBeNull();
    expect(result.zip_code).toBeNull();
    expect(result.country_code).toBeNull();
    expect(result.billing_address).toBeNull();
    expect(result.locale).toBeNull();
    expect(result.currency).toBeNull();
  });

  it("accepts missing optional fields (API omits them)", () => {
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      vat_number: _,
      tax_identification_number: _2,
      address: _3,
      city: _4,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      zip_code: _5,
      province_code: _6,
      country_code: _7,
      delivery_address: _8,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      locale: _9,
      currency: _10,
      ...input
    } = validClient;
    const result = ClientSchema.parse(input);
    expect(result.vat_number).toBeUndefined();
    expect(result.tax_identification_number).toBeUndefined();
    expect(result.address).toBeUndefined();
    expect(result.city).toBeUndefined();
    expect(result.zip_code).toBeUndefined();
    expect(result.province_code).toBeUndefined();
    expect(result.country_code).toBeUndefined();
    expect(result.delivery_address).toBeUndefined();
    expect(result.locale).toBeUndefined();
    expect(result.currency).toBeUndefined();
  });

  it("rejects missing required fields", () => {
    expect(() => ClientSchema.parse({ id: "client-1" })).toThrow();
  });
});
