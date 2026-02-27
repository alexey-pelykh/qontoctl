// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI_PATH = resolve(
  import.meta.dirname,
  "../../../qontoctl/dist/cli.js",
);

/**
 * Build a subprocess env with HOME (and USERPROFILE on Windows) pointing
 * to the given directory so the CLI reads/writes profiles there.
 */
function homeEnv(
  homeDir: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    PATH: process.env["PATH"] ?? "",
    HOME: homeDir,
    USERPROFILE: homeDir,
    ...extra,
  };
}

/** Run the CLI synchronously and capture stdout, stderr, and exit code. */
function cli(
  args: string[],
  options?: { env?: Record<string, string>; input?: string },
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: options?.env,
    input: options?.input,
    timeout: 15_000,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status ?? 1,
  };
}

/**
 * Run the CLI asynchronously, feeding stdin lines one at a time after
 * each prompt appears on stderr. This is required because Node.js
 * readline/promises closes when the input stream ends, which prevents
 * subsequent question() calls from resolving if all data is piped at once.
 */
function cliInteractive(
  args: string[],
  options: { env?: Record<string, string>; lines: string[] },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn("node", [CLI_PATH, ...args], {
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let idx = 0;

    child.stdout?.setEncoding("utf-8");
    child.stderr?.setEncoding("utf-8");
    child.stdout?.on("data", (d: string) => (stdout += d));

    // Wait for each prompt on stderr before writing the next input line.
    child.stderr?.on("data", (d: string) => {
      stderr += d;
      if (idx < options.lines.length) {
        child.stdin?.write(options.lines[idx++] + "\n");
      }
      if (idx >= options.lines.length) {
        child.stdin?.end();
      }
    });

    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

// ---------------------------------------------------------------------------
// Local profile commands (no network required)
// ---------------------------------------------------------------------------

describe("profile commands (e2e)", () => {
  // AC: Given named profiles in ~/.qontoctl/,
  //     When `profile list` is run,
  //     Then all profile names are displayed
  describe("profile list", () => {
    let listDir: string;

    beforeAll(() => {
      listDir = mkdtempSync(join(tmpdir(), "qontoctl-list-e2e-"));
      const dir = join(listDir, ".qontoctl");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "personal.yaml"),
        "api-key:\n  organization_slug: org-a\n  secret_key: key-a\n",
      );
      writeFileSync(
        join(dir, "work.yaml"),
        "api-key:\n  organization_slug: org-b\n  secret_key: key-b\n",
      );
      writeFileSync(join(dir, "notes.txt"), "not a profile");
    });

    afterAll(() => {
      rmSync(listDir, { recursive: true, force: true });
    });

    it("lists all profile names sorted alphabetically", () => {
      const { stdout, exitCode } = cli(["profile", "list"], {
        env: homeEnv(listDir),
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("personal");
      expect(stdout).toContain("work");
      expect(stdout).not.toContain("notes");
    });

    it("shows no-profiles message when directory is empty", () => {
      const emptyDir = mkdtempSync(join(tmpdir(), "qontoctl-empty-e2e-"));
      mkdirSync(join(emptyDir, ".qontoctl"), { recursive: true });
      try {
        const { stdout, exitCode } = cli(["profile", "list"], {
          env: homeEnv(emptyDir),
        });
        expect(exitCode).toBe(0);
        expect(stdout).toContain("No profiles found.");
      } finally {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });

  // AC: Given a named profile,
  //     When `profile show <name>` is run,
  //     Then profile details are shown with secrets redacted
  describe("profile show", () => {
    let showDir: string;

    beforeAll(() => {
      showDir = mkdtempSync(join(tmpdir(), "qontoctl-show-e2e-"));
      const dir = join(showDir, ".qontoctl");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "demo.yaml"),
        "api-key:\n  organization_slug: demo-org\n  secret_key: sk_live_abcdef7890\n",
      );
    });

    afterAll(() => {
      rmSync(showDir, { recursive: true, force: true });
    });

    it("displays profile with secret key redacted", () => {
      const { stdout, exitCode } = cli(["profile", "show", "demo"], {
        env: homeEnv(showDir),
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("demo");
      expect(stdout).toContain("demo-org");
      expect(stdout).toContain("****7890");
      expect(stdout).not.toContain("sk_live_abcdef7890");
    });

    it("reports error for non-existent profile", () => {
      const { stderr, exitCode } = cli(
        ["profile", "show", "nonexistent"],
        { env: homeEnv(showDir) },
      );
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("not found");
    });
  });

  // AC: Given interactive input,
  //     When `profile add <name>` is run,
  //     Then a new profile YAML is created at ~/.qontoctl/{name}.yaml
  describe("profile add", () => {
    let addDir: string;

    beforeAll(() => {
      addDir = mkdtempSync(join(tmpdir(), "qontoctl-add-e2e-"));
    });

    afterAll(() => {
      rmSync(addDir, { recursive: true, force: true });
    });

    it("creates a new profile yaml from interactive input", async () => {
      const { stdout, exitCode } = await cliInteractive(
        ["profile", "add", "myprofile"],
        {
          env: homeEnv(addDir),
          lines: ["test-org-slug", "sk_test_secretkey123"],
        },
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Profile "myprofile" created');

      const profilePath = join(addDir, ".qontoctl", "myprofile.yaml");
      expect(existsSync(profilePath)).toBe(true);

      const content = readFileSync(profilePath, "utf-8");
      expect(content).toContain("organization_slug: test-org-slug");
      expect(content).toContain("secret_key: sk_test_secretkey123");
    });

    it("refuses to overwrite an existing profile", async () => {
      // myprofile was created in the previous test
      const { stderr, exitCode } = await cliInteractive(
        ["profile", "add", "myprofile"],
        {
          env: homeEnv(addDir),
          lines: ["new-org", "new-key"],
        },
      );
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("already exists");
    });
  });

  // AC: Given an existing named profile,
  //     When `profile remove <name>` is run,
  //     Then the file is deleted after confirmation
  describe("profile remove", () => {
    let removeDir: string;

    beforeAll(() => {
      removeDir = mkdtempSync(join(tmpdir(), "qontoctl-remove-e2e-"));
      const dir = join(removeDir, ".qontoctl");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "disposable.yaml"),
        "api-key:\n  organization_slug: org\n  secret_key: key\n",
      );
      writeFileSync(
        join(dir, "keeper.yaml"),
        "api-key:\n  organization_slug: org2\n  secret_key: key2\n",
      );
    });

    afterAll(() => {
      rmSync(removeDir, { recursive: true, force: true });
    });

    it("deletes profile file after yes confirmation", () => {
      const profilePath = join(
        removeDir,
        ".qontoctl",
        "disposable.yaml",
      );
      expect(existsSync(profilePath)).toBe(true);

      const { stdout, exitCode } = cli(
        ["profile", "remove", "disposable"],
        { env: homeEnv(removeDir), input: "yes\n" },
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Profile "disposable" removed.');
      expect(existsSync(profilePath)).toBe(false);
    });

    it("aborts removal when user does not confirm", () => {
      const profilePath = join(removeDir, ".qontoctl", "keeper.yaml");
      expect(existsSync(profilePath)).toBe(true);

      const { stdout, exitCode } = cli(
        ["profile", "remove", "keeper"],
        { env: homeEnv(removeDir), input: "no\n" },
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Aborted.");
      expect(existsSync(profilePath)).toBe(true);
    });

    it("reports error for non-existent profile", () => {
      const { stderr, exitCode } = cli(
        ["profile", "remove", "ghost"],
        { env: homeEnv(removeDir), input: "yes\n" },
      );
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("not found");
    });
  });
});

// ---------------------------------------------------------------------------
// profile test — requires sandbox API access
// ---------------------------------------------------------------------------

function hasSandboxCredentials(): boolean {
  return (
    process.env["QONTOCTL_ORGANIZATION_SLUG"] !== undefined &&
    process.env["QONTOCTL_SECRET_KEY"] !== undefined
  );
}

describe.skipIf(!hasSandboxCredentials())(
  "profile test (e2e, sandbox)",
  () => {
    let tempDir: string;

    beforeAll(() => {
      tempDir = mkdtempSync(join(tmpdir(), "qontoctl-test-e2e-"));
    });

    afterAll(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    // AC: Given valid API key credentials,
    //     When `profile test` is run,
    //     Then it calls GET /v2/organization and reports success with org name
    it("reports success with organization name for valid credentials", () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by hasSandboxCredentials()
      const orgSlug = process.env["QONTOCTL_ORGANIZATION_SLUG"]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by hasSandboxCredentials()
      const secretKey = process.env["QONTOCTL_SECRET_KEY"]!;
      const { stdout, exitCode } = cli(["profile", "test"], {
        env: homeEnv(tempDir, {
          QONTOCTL_ORGANIZATION_SLUG: orgSlug,
          QONTOCTL_SECRET_KEY: secretKey,
          QONTOCTL_SANDBOX: "true",
        }),
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Success: connected to organization");
    });

    // AC: Given invalid credentials,
    //     When `profile test` is run,
    //     Then it reports failure with the error message
    it("reports failure with error message for invalid credentials", () => {
      const { stderr, exitCode } = cli(["profile", "test"], {
        env: homeEnv(tempDir, {
          QONTOCTL_ORGANIZATION_SLUG: "invalid-org-slug",
          QONTOCTL_SECRET_KEY: "invalid-secret-key",
          QONTOCTL_SANDBOX: "true",
        }),
      });
      expect(exitCode).not.toBe(0);
      expect(stderr).toMatch(/error/i);
    });
  },
);
