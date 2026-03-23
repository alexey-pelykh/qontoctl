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

describe("profile show", () => {
  let testHome: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    testHome = join(tmpdir(), `qontoctl-test-${randomUUID()}`);
    mockHomeDir = testHome;
    await mkdir(testHome, { recursive: true });
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    await rm(testHome, { recursive: true, force: true });
  });

  it("shows error when profile does not exist", async () => {
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "show", "nonexistent"], { from: "user" });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Profile "nonexistent" not found.');
    expect(process.exitCode).toBe(1);
  });

  it("shows profile details with redacted secret key", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "work.yaml"),
      "api-key:\n  organization-slug: my-org-slug\n  secret-key: sk_test_abcdef1234\n",
    );

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "show", "work"], { from: "user" });

    const output = consoleSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain("work");
    expect(output).toContain("my-org-slug");
    expect(output).toContain("****1234");
    expect(output).not.toContain("sk_test_abcdef1234");
  });

  it("outputs json format with --output json", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "dev.yaml"),
      "api-key:\n  organization-slug: dev-org\n  secret-key: sk_dev_xyz789\n",
    );

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--output", "json", "profile", "show", "dev"], { from: "user" });

    const output = consoleSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      name: "dev",
      "organization-slug": "dev-org",
      "secret-key": "****z789",
    });
  });

  it("redacts short secret keys completely", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "short.yaml"), "api-key:\n  organization-slug: org\n  secret-key: abc\n");

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["--output", "json", "profile", "show", "short"], { from: "user" });

    const output = consoleSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output) as Record<string, unknown>[];
    expect(parsed[0]?.["secret-key"]).toBe("****");
  });
});
