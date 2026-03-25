// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseResponse } from "./response.js";

describe("parseResponse", () => {
  const schema = z.object({
    transfer: z.object({
      id: z.string(),
      amount: z.number(),
    }),
  });

  it("returns parsed data for valid response", () => {
    const response = { transfer: { id: "tx-1", amount: 100 } };
    const result = parseResponse(schema, response, "/v2/transfers/tx-1");
    expect(result).toEqual({ transfer: { id: "tx-1", amount: 100 } });
  });

  it("throws with endpoint path when required key is missing", () => {
    const response = { transfer: { id: "tx-1" } };
    expect(() => parseResponse(schema, response, "/v2/transfers/tx-1")).toThrow(
      /Invalid API response from \/v2\/transfers\/tx-1/,
    );
  });

  it("strips extra fields from response", () => {
    const response = { transfer: { id: "tx-1", amount: 100, extra: "field" }, bonus: true };
    const result = parseResponse(schema, response, "/v2/transfers/tx-1");
    expect(result).toEqual({ transfer: { id: "tx-1", amount: 100 } });
    expect(result).not.toHaveProperty("bonus");
    expect(result.transfer).not.toHaveProperty("extra");
  });

  it("re-throws non-ZodError errors unchanged", () => {
    const throwingSchema = z.unknown().transform(() => {
      throw new TypeError("unexpected");
    });
    expect(() => parseResponse(throwingSchema, {}, "/v2/test")).toThrow(TypeError);
    expect(() => parseResponse(throwingSchema, {}, "/v2/test")).toThrow("unexpected");
  });
});
