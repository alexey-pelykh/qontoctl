// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { z } from "zod";

import { SendQuoteRequestPayloadSchema } from "./schemas.js";

describe("SendQuoteRequestPayloadSchema", () => {
  it("parses a valid payload (all four fields)", () => {
    const data = {
      send_to: ["a@example.com", "b@example.com"],
      copy_to_self: false,
      email_title: "Your quote",
      email_body: "Please find the attached quote.",
    };
    expect(SendQuoteRequestPayloadSchema.parse(data)).toEqual(data);
  });

  it("applies default copy_to_self=true when omitted; email_body remains optional", () => {
    const result = SendQuoteRequestPayloadSchema.parse({
      send_to: ["a@example.com"],
      email_title: "Your quote",
    });
    expect(result.copy_to_self).toBe(true);
    expect(result.email_body).toBeUndefined();
  });

  it("rejects payload missing send_to with a ZodError citing the send_to path", () => {
    let captured: unknown;
    try {
      SendQuoteRequestPayloadSchema.parse({ email_title: "X" });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(z.ZodError);
    const zodError = captured as z.ZodError;
    expect(zodError.issues.some((issue) => issue.path[0] === "send_to")).toBe(true);
  });

  it("rejects payload missing email_title with a ZodError citing the email_title path", () => {
    let captured: unknown;
    try {
      SendQuoteRequestPayloadSchema.parse({ send_to: ["a@example.com"] });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(z.ZodError);
    const zodError = captured as z.ZodError;
    expect(zodError.issues.some((issue) => issue.path[0] === "email_title")).toBe(true);
  });

  it("rejects payload with a non-email string in send_to", () => {
    expect(() =>
      SendQuoteRequestPayloadSchema.parse({
        send_to: ["not-an-email"],
        email_title: "X",
      }),
    ).toThrow();
  });

  it("strips unknown fields", () => {
    const result = SendQuoteRequestPayloadSchema.parse({
      send_to: ["a@example.com"],
      email_title: "X",
      bogus_extra: "should be stripped",
    });
    expect(result).not.toHaveProperty("bogus_extra");
  });
});
