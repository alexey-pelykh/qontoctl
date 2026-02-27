// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createProgram } from "../../program.js";
import { registerProfileCommands } from "./index.js";

let mockHomeDir = "";
let mockQuestionResponses: string[] = [];

vi.mock("node:os", async (importOriginal) => {
  const os = await importOriginal<typeof import("node:os")>();
  return { ...os, homedir: () => mockHomeDir };
});

vi.mock("node:readline/promises", () => ({
  createInterface: () => ({
    question: vi.fn().mockImplementation(() => {
      const response = mockQuestionResponses.shift();
      return Promise.resolve(response ?? "");
    }),
    close: vi.fn(),
  }),
}));

describe("profile add", () => {
  let testHome: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    testHome = join(tmpdir(), `qontoctl-test-${randomUUID()}`);
    mockHomeDir = testHome;
    mockQuestionResponses = [];
    await mkdir(testHome, { recursive: true });
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    await rm(testHome, { recursive: true, force: true });
  });

  it("creates a new profile yaml file", async () => {
    mockQuestionResponses = ["my-org", "sk_test_12345678"];

    const program = createProgram();
    registerProfileCommands(program);
    program.exitOverride();

    await program.parseAsync(["profile", "add", "work"], { from: "user" });

    const path = join(testHome, ".qontoctl", "work.yaml");
    const content = await readFile(path, "utf-8");
    expect(content).toContain("organization_slug: my-org");
    expect(content).toContain("secret_key: sk_test_12345678");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Profile "work" created'));
  });

  it("creates config directory if it does not exist", async () => {
    mockQuestionResponses = ["org-slug", "secret-key-value"];

    const program = createProgram();
    registerProfileCommands(program);
    program.exitOverride();

    await program.parseAsync(["profile", "add", "new-profile"], { from: "user" });

    const path = join(testHome, ".qontoctl", "new-profile.yaml");
    const content = await readFile(path, "utf-8");
    expect(content).toContain("organization_slug: org-slug");
  });

  it("refuses to overwrite existing profile", async () => {
    const configDir = join(testHome, ".qontoctl");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "existing.yaml"), "api-key:\n  organization_slug: org\n  secret_key: key\n");

    mockQuestionResponses = ["new-org", "new-key"];

    const program = createProgram();
    registerProfileCommands(program);
    program.exitOverride();

    await program.parseAsync(["profile", "add", "existing"], { from: "user" });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Profile "existing" already exists. Remove it first to recreate.',
    );
    expect(process.exitCode).toBe(1);
  });

  it("rejects empty organization slug", async () => {
    mockQuestionResponses = ["", "some-key"];

    const program = createProgram();
    registerProfileCommands(program);
    program.exitOverride();

    await program.parseAsync(["profile", "add", "bad-profile"], { from: "user" });

    expect(consoleErrorSpy).toHaveBeenCalledWith("Organization slug cannot be empty.");
    expect(process.exitCode).toBe(1);
  });

  it("rejects empty secret key", async () => {
    mockQuestionResponses = ["my-org", ""];

    const program = createProgram();
    registerProfileCommands(program);
    program.exitOverride();

    await program.parseAsync(["profile", "add", "bad-profile"], { from: "user" });

    expect(consoleErrorSpy).toHaveBeenCalledWith("Secret key cannot be empty.");
    expect(process.exitCode).toBe(1);
  });
});
