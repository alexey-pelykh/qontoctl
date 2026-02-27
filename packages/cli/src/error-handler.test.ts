// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConfigError, AuthError, QontoApiError, QontoRateLimitError } from "@qontoctl/core";
import { handleCliError } from "./error-handler.js";

describe("handleCliError", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  describe("ConfigError", () => {
    it("shows configuration guidance", () => {
      const error = new ConfigError("No credentials found.");

      handleCliError(error, false);

      const output = stderrSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("Configuration error: No credentials found.");
      expect(output).toContain("~/.qontoctl.yaml");
      expect(output).toContain("organization-slug");
      expect(output).toContain("QONTOCTL_ORGANIZATION_SLUG");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("AuthError", () => {
    it("suggests checking credentials", () => {
      const error = new AuthError("Missing organization slug in API key credentials");

      handleCliError(error, false);

      const output = stderrSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("Authentication error:");
      expect(output).toContain("Missing organization slug");
      expect(output).toContain("Verify your API key credentials");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("QontoApiError", () => {
    it("shows HTTP status and error details", () => {
      const error = new QontoApiError(401, [{ code: "unauthorized", detail: "Invalid credentials" }]);

      handleCliError(error, false);

      const output = stderrSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("Qonto API error (HTTP 401):");
      expect(output).toContain("unauthorized: Invalid credentials");
      expect(process.exitCode).toBe(1);
    });

    it("formats multiple error entries", () => {
      const error = new QontoApiError(422, [
        { code: "invalid", detail: "Field A is required" },
        { code: "invalid", detail: "Field B is too long" },
      ]);

      handleCliError(error, false);

      const output = stderrSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("  - invalid: Field A is required");
      expect(output).toContain("  - invalid: Field B is too long");
    });
  });

  describe("QontoRateLimitError", () => {
    it("shows retry-after when available", () => {
      const error = new QontoRateLimitError(30);

      handleCliError(error, false);

      const output = stderrSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("Rate limit exceeded.");
      expect(output).toContain("Retry after 30 seconds.");
      expect(process.exitCode).toBe(1);
    });

    it("omits retry-after when unavailable", () => {
      const error = new QontoRateLimitError(undefined);

      handleCliError(error, false);

      const output = stderrSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("Rate limit exceeded.");
      expect(output).toContain("Please wait before retrying.");
      expect(output).not.toContain("Retry after");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("unknown errors", () => {
    it("shows message only without debug", () => {
      const error = new Error("Something went wrong");

      handleCliError(error, false);

      const output = stderrSpy.mock.calls[0]?.[0] as string;
      expect(output).toBe("Error: Something went wrong\n");
      expect(process.exitCode).toBe(1);
    });

    it("shows stack trace with debug", () => {
      const error = new Error("Something went wrong");

      handleCliError(error, true);

      const output = stderrSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("Error: Something went wrong");
      expect(output).toContain("at ");
      expect(process.exitCode).toBe(1);
    });

    it("handles non-Error values", () => {
      handleCliError("string error", false);

      const output = stderrSpy.mock.calls[0]?.[0] as string;
      expect(output).toBe("Error: string error\n");
      expect(process.exitCode).toBe(1);
    });
  });
});
