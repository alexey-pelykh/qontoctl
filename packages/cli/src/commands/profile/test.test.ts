// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createProgram } from "../../program.js";

let mockHomeDir = "";

vi.mock("node:os", async (importOriginal) => {
  const os = await importOriginal<typeof import("node:os")>();
  return { ...os, homedir: () => mockHomeDir };
});

describe("profile test", () => {
  let testHome: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    testHome = join(tmpdir(), `qontoctl-test-${randomUUID()}`);
    mockHomeDir = testHome;
    await mkdir(testHome, { recursive: true });
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.exitCode = undefined;
    await rm(testHome, { recursive: true, force: true });
  });

  it("reports success with organization name", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "work.yaml"),
      "api-key:\n  organization-slug: my-org\n  secret-key: sk_test_1234\n",
    );

    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            organization: { name: "My Company", slug: "my-company-1234" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--profile", "work", "profile", "test"], { from: "user" });

    expect(consoleSpy).toHaveBeenCalledWith('Success: connected to organization "My Company" (my-company-1234)');
  });

  it("reports failure on API error", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "bad.yaml"), "api-key:\n  organization-slug: bad-org\n  secret-key: sk_invalid\n");

    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            errors: [{ code: "unauthorized", detail: "Invalid credentials" }],
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--profile", "bad", "profile", "test"], { from: "user" });

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("API error (401)"));
    expect(process.exitCode).toBe(1);
  });

  it("reports failure when no config found", async () => {
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--profile", "nonexistent", "profile", "test"], { from: "user" });

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Configuration error"));
    expect(process.exitCode).toBe(1);
  });

  it("reports no credentials for OAuth-only profile", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "oauth-only.yaml"),
      "oauth:\n  client-id: test-client-id\n  client-secret: test-client-secret\n",
    );

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--profile", "oauth-only", "profile", "test"], { from: "user" });

    expect(consoleErrorSpy).toHaveBeenCalledWith("Configuration error: no credentials found.");
    expect(process.exitCode).toBe(1);
  });

  it("reports rate limit error", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "work.yaml"),
      "api-key:\n  organization-slug: my-org\n  secret-key: sk_test_1234\n",
    );

    fetchSpy.mockImplementation(() =>
      Promise.resolve(new Response("", { status: 429, headers: { "Retry-After": "0.001" } })),
    );

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--profile", "work", "profile", "test"], { from: "user" });

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Rate limited"));
    expect(process.exitCode).toBe(1);
  });

  it("outputs verbose logs with --verbose", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "work.yaml"),
      "api-key:\n  organization-slug: my-org\n  secret-key: sk_test_1234\n",
    );

    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            organization: { name: "My Company", slug: "my-company-1234" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--profile", "work", "--verbose", "profile", "test"], { from: "user" });

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[verbose\] GET /));
    expect(consoleSpy).toHaveBeenCalledWith('Success: connected to organization "My Company" (my-company-1234)');
  });

  it("outputs debug warning and logs with --debug", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "work.yaml"),
      "api-key:\n  organization-slug: my-org\n  secret-key: sk_test_1234\n",
    );

    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            organization: { name: "My Company", slug: "my-company-1234" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--profile", "work", "--debug", "profile", "test"], { from: "user" });

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Debug mode logs full API responses"));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[debug\] /));
    expect(consoleSpy).toHaveBeenCalledWith('Success: connected to organization "My Company" (my-company-1234)');
  });
});
