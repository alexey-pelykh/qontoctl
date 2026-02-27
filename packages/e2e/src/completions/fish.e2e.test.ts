// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

function hasFish(): boolean {
  try {
    execFileSync("fish", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasFish())("fish completion (e2e)", () => {
  let tempDir: string;
  let completionScript: string;
  let scriptPath: string;

  beforeAll(() => {
    completionScript = execFileSync("node", [CLI_PATH, "completion", "fish"], {
      encoding: "utf-8",
    });
    tempDir = mkdtempSync(join(tmpdir(), "qontoctl-fish-e2e-"));
    scriptPath = join(tempDir, "qontoctl.fish");
    writeFileSync(scriptPath, completionScript);
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("generates a sourceable script without errors", () => {
    execFileSync("fish", ["-c", `source "${scriptPath}"`], {
      encoding: "utf-8",
    });
  });

  it("completes top-level commands", () => {
    const result = execFileSync(
      "fish",
      ["-c", [`source "${scriptPath}"`, 'complete --do-complete "qontoctl "'].join("; ")],
      { encoding: "utf-8" },
    );
    const completions = result
      .trim()
      .split("\n")
      .map((l) => l.split("\t")[0] ?? "");
    expect(completions).toContain("completion");
    expect(completions).toContain("org");
    expect(completions).toContain("account");
    expect(completions).toContain("transaction");
    expect(completions).toContain("profile");
  });

  it("completes subcommands for completion command", () => {
    const result = execFileSync(
      "fish",
      ["-c", [`source "${scriptPath}"`, 'complete --do-complete "qontoctl completion "'].join("; ")],
      { encoding: "utf-8" },
    );
    const completions = result
      .trim()
      .split("\n")
      .map((l) => l.split("\t")[0] ?? "");
    expect(completions).toContain("bash");
    expect(completions).toContain("zsh");
    expect(completions).toContain("fish");
  });

  it("disables file completions by default", () => {
    expect(completionScript).toContain("complete -c qontoctl -f");
  });

  it("includes global options", () => {
    expect(completionScript).toContain("-l output");
    expect(completionScript).toContain("-l verbose");
    expect(completionScript).toContain("-l help");
    expect(completionScript).toContain("-l version");
  });
});
