// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import {
  ConfigError,
  AuthError,
  QontoApiError,
  QontoRateLimitError,
  QontoScaRequiredError,
  HttpClient,
} from "@qontoctl/core";
import { withClient } from "./errors.js";

const fakeClient = {} as HttpClient;
const succeedingFactory = () => Promise.resolve(fakeClient);

describe("withClient", () => {
  it("returns handler result on success", async () => {
    const result = await withClient(succeedingFactory, async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));

    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([{ type: "text", text: "ok" }]);
  });

  it("catches handler errors and formats them", async () => {
    const result = await withClient(succeedingFactory, async () => {
      throw new QontoApiError(404, [{ code: "not_found", detail: "Resource not found" }]);
    });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("HTTP 404");
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("Resource not found");
  });

  describe("ConfigError", () => {
    it("formats configuration error with setup guidance", async () => {
      const factory = () => Promise.reject(new ConfigError("No credentials found"));
      const result = await withClient(factory, async () => ({
        content: [{ type: "text" as const, text: "unreachable" }],
      }));

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Configuration error");
      expect(text).toContain("No credentials found");
      expect(text).toContain("~/.qontoctl.yaml");
      expect(text).toContain("QONTOCTL_ORGANIZATION_SLUG");
      expect(text).toContain("QONTOCTL_SECRET_KEY");
    });
  });

  describe("AuthError", () => {
    it("formats authentication error", async () => {
      const factory = () => Promise.reject(new AuthError("Missing organization slug"));
      const result = await withClient(factory, async () => ({
        content: [{ type: "text" as const, text: "unreachable" }],
      }));

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Authentication error");
      expect(text).toContain("Missing organization slug");
    });
  });

  describe("QontoApiError", () => {
    it("formats API error with status and details", async () => {
      const factory = () =>
        Promise.reject(new QontoApiError(422, [{ code: "invalid_parameter", detail: "bank_account_id is required" }]));
      const result = await withClient(factory, async () => ({
        content: [{ type: "text" as const, text: "unreachable" }],
      }));

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("HTTP 422");
      expect(text).toContain("invalid_parameter");
      expect(text).toContain("bank_account_id is required");
    });

    it("formats multiple error entries", async () => {
      const factory = () =>
        Promise.reject(
          new QontoApiError(400, [
            { code: "invalid", detail: "Field A" },
            { code: "missing", detail: "Field B" },
          ]),
        );
      const result = await withClient(factory, async () => ({
        content: [{ type: "text" as const, text: "unreachable" }],
      }));

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("invalid: Field A");
      expect(text).toContain("missing: Field B");
    });
  });

  describe("QontoRateLimitError", () => {
    it("formats rate limit error with retry-after", async () => {
      const factory = () => Promise.reject(new QontoRateLimitError(30));
      const result = await withClient(factory, async () => ({
        content: [{ type: "text" as const, text: "unreachable" }],
      }));

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Rate limit exceeded");
      expect(text).toContain("30 seconds");
    });

    it("formats rate limit error without retry-after", async () => {
      const factory = () => Promise.reject(new QontoRateLimitError(undefined));
      const result = await withClient(factory, async () => ({
        content: [{ type: "text" as const, text: "unreachable" }],
      }));

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Rate limit exceeded");
      expect(text).not.toContain("seconds");
    });
  });

  describe("QontoScaRequiredError", () => {
    it("returns structured SCA-pending response with isError: false", async () => {
      const result = await withClient(succeedingFactory, async () => {
        throw new QontoScaRequiredError("sca-tok-abc");
      });

      expect(result.isError).toBe(false);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("SCA required");
      expect(text).toContain("approve this operation on their Qonto mobile app");
      expect(text).toContain("sca-tok-abc");
      expect(text).toContain("/v2/sca/sessions/sca-tok-abc");
    });

    it("includes polling instructions and status descriptions", async () => {
      const result = await withClient(succeedingFactory, async () => {
        throw new QontoScaRequiredError("sca-tok-def");
      });

      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("waiting");
      expect(text).toContain("allow");
      expect(text).toContain("deny");
      expect(text).toContain("15 minutes");
    });

    it("returns a single text content item", async () => {
      const result = await withClient(succeedingFactory, async () => {
        throw new QontoScaRequiredError("sca-tok-ghi");
      });

      expect(result.content).toHaveLength(1);
      expect((result.content[0] as { type: string }).type).toBe("text");
    });
  });

  describe("unknown errors", () => {
    it("formats unknown Error instances", async () => {
      const factory = () => Promise.reject(new Error("something broke"));
      const result = await withClient(factory, async () => ({
        content: [{ type: "text" as const, text: "unreachable" }],
      }));

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Unexpected error");
      expect(text).toContain("something broke");
    });

    it("formats non-Error throws", async () => {
      const factory = () => Promise.reject("string error");
      const result = await withClient(factory, async () => ({
        content: [{ type: "text" as const, text: "unreachable" }],
      }));

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Unexpected error");
      expect(text).toContain("string error");
    });
  });
});
