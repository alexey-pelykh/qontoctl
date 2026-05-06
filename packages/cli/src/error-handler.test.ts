// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ConfigError,
  AuthError,
  QontoApiError,
  QontoOAuthScopeError,
  QontoRateLimitError,
  QontoScaNotEnrolledError,
  QontoScaRequiredError,
  ScaTimeoutError,
  ScaDeniedError,
} from "@qontoctl/core";
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

  describe("QontoOAuthScopeError", () => {
    it("shows scope remediation guidance", () => {
      const error = new QontoOAuthScopeError([{ code: "forbidden", detail: "missing required oauth scope" }]);

      handleCliError(error, false);

      const output = stderrSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("Qonto API error (HTTP 403):");
      expect(output).toContain("missing required oauth scope");
      expect(output).toContain("OAuth token is missing a required scope");
      expect(output).toContain("qontoctl auth setup");
      expect(output).toContain("qontoctl auth login");
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

  describe("QontoScaRequiredError", () => {
    it("shows SCA guidance with session token", () => {
      const error = new QontoScaRequiredError("sca-tok-test");

      handleCliError(error, false);

      const output = stderrSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("SCA (Strong Customer Authentication) required");
      expect(output).toContain("sca-tok-test");
      expect(output).toContain("approve the operation on your Qonto mobile app");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("QontoScaNotEnrolledError", () => {
    it("shows enrollment guidance with HTTP status and error details", () => {
      const error = new QontoScaNotEnrolledError([
        { code: "sca_not_enrolled", detail: "You must enable SCA to perform this action" },
      ]);

      handleCliError(error, false);

      const output = stderrSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("Qonto API error (HTTP 428):");
      expect(output).toContain("sca_not_enrolled: You must enable SCA to perform this action");
      expect(output).toContain("Strong Customer Authentication (SCA) is not enabled");
      expect(output).toContain("configuration error");
      expect(output).toContain("Enroll a paired device or passkey in the Qonto mobile app");
      expect(output).toContain("https://docs.qonto.com/api-reference/business-api/authentication/sca/sca-flows");
      expect(process.exitCode).toBe(1);
    });

    it("is matched before generic QontoApiError handler", () => {
      // Same setup as above; assertion focuses on dispatch order.
      const error = new QontoScaNotEnrolledError([{ code: "sca_not_enrolled", detail: "..." }]);

      handleCliError(error, false);

      const output = stderrSpy.mock.calls[0]?.[0] as string;
      // Generic QontoApiError handler would NOT include enrollment guidance.
      expect(output).toContain("not enabled on this Qonto account");
    });
  });

  describe("ScaTimeoutError", () => {
    it("shows timeout message with duration", () => {
      const error = new ScaTimeoutError("tok-timeout", 900_000);

      handleCliError(error, false);

      const output = stderrSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("SCA authentication timed out");
      expect(output).toContain("900s");
      expect(output).toContain("Please try again");
      expect(process.exitCode).toBe(1);
    });
  });

  describe("ScaDeniedError", () => {
    it("shows denial message", () => {
      const error = new ScaDeniedError("tok-denied");

      handleCliError(error, false);

      const output = stderrSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("SCA authentication was denied");
      expect(output).toContain("cancelled");
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
