// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, readFile, stat, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { text } from "@clack/prompts";
import { createProgram } from "../../program.js";

let mockHomeDir = "";
let mockTextResponses: (string | symbol)[] = [];
const cancelSymbol = Symbol("cancel");

vi.mock("node:os", async (importOriginal) => {
  const os = await importOriginal<typeof import("node:os")>();
  return { ...os, homedir: () => mockHomeDir };
});

vi.mock("@clack/prompts", () => ({
  text: vi.fn(),
  isCancel: (value: unknown) => value === cancelSymbol,
}));

describe("profile add", () => {
  let testHome: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    testHome = join(tmpdir(), `qontoctl-test-${randomUUID()}`);
    mockHomeDir = testHome;
    mockTextResponses = [];
    await mkdir(testHome, { recursive: true });
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(text).mockImplementation(() => {
      const response = mockTextResponses.shift() ?? "";
      return Promise.resolve(response);
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    await rm(testHome, { recursive: true, force: true });
  });

  it("creates a new profile yaml file", async () => {
    mockTextResponses = ["my-org", "sk_test_12345678"];

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "add", "work"], { from: "user" });

    const path = join(testHome, ".qontoctl", "work.yaml");
    const content = await readFile(path, "utf-8");
    expect(content).toContain("organization-slug: my-org");
    expect(content).toContain("secret-key: sk_test_12345678");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Profile "work" created'));
  });

  it("creates config directory if it does not exist", async () => {
    mockTextResponses = ["org-slug", "secret-key-value"];

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "add", "new-profile"], { from: "user" });

    const path = join(testHome, ".qontoctl", "new-profile.yaml");
    const content = await readFile(path, "utf-8");
    expect(content).toContain("organization-slug: org-slug");
  });

  it("refuses to overwrite existing profile", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "existing.yaml"), "api-key:\n  organization-slug: org\n  secret-key: key\n");

    mockTextResponses = ["new-org", "new-key"];

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "add", "existing"], { from: "user" });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Profile "existing" already exists. Remove it first to recreate.');
    expect(process.exitCode).toBe(1);
  });

  it("validates organization slug is not empty", async () => {
    mockTextResponses = ["my-org", "my-secret"];

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "add", "validate-slug"], { from: "user" });

    const slugCall = vi.mocked(text).mock.calls[0];
    expect(slugCall).toBeDefined();
    const slugValidate = slugCall?.[0].validate;
    expect(slugValidate).toBeDefined();
    expect(slugValidate?.("")).toBe("Organization slug cannot be empty.");
    expect(slugValidate?.("  ")).toBe("Organization slug cannot be empty.");
    expect(slugValidate?.(undefined)).toBe("Organization slug cannot be empty.");
    expect(slugValidate?.("valid")).toBeUndefined();
  });

  it("validates secret key is not empty", async () => {
    mockTextResponses = ["my-org", "my-secret"];

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "add", "validate-key"], { from: "user" });

    const keyCall = vi.mocked(text).mock.calls[1];
    expect(keyCall).toBeDefined();
    const keyValidate = keyCall?.[0].validate;
    expect(keyValidate).toBeDefined();
    expect(keyValidate?.("")).toBe("Secret key cannot be empty.");
    expect(keyValidate?.("  ")).toBe("Secret key cannot be empty.");
    expect(keyValidate?.(undefined)).toBe("Secret key cannot be empty.");
    expect(keyValidate?.("valid")).toBeUndefined();
  });

  it("exits cleanly when user cancels", async () => {
    mockTextResponses = [cancelSymbol];
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);

    const program = createProgram();
    program.exitOverride();

    await expect(program.parseAsync(["profile", "add", "cancel-test"], { from: "user" })).rejects.toThrow();

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it.skipIf(process.platform === "win32")("creates config directory with 0700 permissions", async () => {
    mockTextResponses = ["my-org", "my-secret"];

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "add", "secure"], { from: "user" });

    const dirStat = await stat(join(testHome, ".qontoctl"));
    expect(dirStat.mode & 0o777).toBe(0o700);
  });

  it.skipIf(process.platform === "win32")("creates profile file with 0600 permissions", async () => {
    mockTextResponses = ["my-org", "my-secret"];

    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(["profile", "add", "secure"], { from: "user" });

    const fileStat = await stat(join(testHome, ".qontoctl", "secure.yaml"));
    expect(fileStat.mode & 0o777).toBe(0o600);
  });
});
