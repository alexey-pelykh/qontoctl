// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { mkdtemp, readFile, writeFile, rm, mkdir, stat, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveOAuthTokens, saveOAuthClientCredentials, clearOAuthTokens, saveOAuthScopes } from "./writer.js";
import { ConfigError } from "./resolve.js";

describe("saveOAuthTokens", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "qontoctl-writer-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates config file when it does not exist", async () => {
    await saveOAuthTokens(
      {
        accessToken: "access-123",
        refreshToken: "refresh-456",
        accessTokenExpiresAt: "2026-02-28T16:00:00Z",
      },
      { home: tempDir },
    );

    const content = await readFile(join(tempDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    expect(oauth["access-token"]).toBe("access-123");
    expect(oauth["refresh-token"]).toBe("refresh-456");
    expect(oauth["access-token-expires-at"]).toBe("2026-02-28T16:00:00Z");
  });

  it("preserves existing config fields", async () => {
    const existingContent = "api-key:\n  organization-slug: my-org\n  secret-key: my-key\n";
    await writeFile(join(tempDir, ".qontoctl.yaml"), existingContent);

    await saveOAuthTokens(
      {
        accessToken: "access-123",
        accessTokenExpiresAt: "2026-02-28T16:00:00Z",
      },
      { home: tempDir },
    );

    const content = await readFile(join(tempDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    const apiKey = doc["api-key"] as Record<string, unknown>;
    expect(apiKey["organization-slug"]).toBe("my-org");
    expect(apiKey["secret-key"]).toBe("my-key");
  });

  it("preserves existing oauth client-id and client-secret", async () => {
    const existingContent = "oauth:\n  client-id: my-client\n  client-secret: my-secret\n";
    await writeFile(join(tempDir, ".qontoctl.yaml"), existingContent);

    await saveOAuthTokens(
      {
        accessToken: "access-123",
        accessTokenExpiresAt: "2026-02-28T16:00:00Z",
      },
      { home: tempDir },
    );

    const content = await readFile(join(tempDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    expect(oauth["client-id"]).toBe("my-client");
    expect(oauth["client-secret"]).toBe("my-secret");
    expect(oauth["access-token"]).toBe("access-123");
  });

  it("writes to profile-specific file", async () => {
    await mkdir(join(tempDir, ".qontoctl"), { recursive: true });

    await saveOAuthTokens(
      {
        accessToken: "access-123",
        accessTokenExpiresAt: "2026-02-28T16:00:00Z",
      },
      { profile: "acme", home: tempDir },
    );

    const content = await readFile(join(tempDir, ".qontoctl", "acme.yaml"), "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    expect(oauth["access-token"]).toBe("access-123");
  });

  it("does not include refresh-token when not provided", async () => {
    await saveOAuthTokens(
      {
        accessToken: "access-123",
        accessTokenExpiresAt: "2026-02-28T16:00:00Z",
      },
      { home: tempDir },
    );

    const content = await readFile(join(tempDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    expect(oauth["refresh-token"]).toBeUndefined();
  });

  it("writes to explicit path option (issue #479)", async () => {
    const explicitPath = join(tempDir, "custom.yaml");
    await saveOAuthTokens(
      {
        accessToken: "access-via-path",
        accessTokenExpiresAt: "2026-12-31T23:59:59Z",
      },
      { path: explicitPath },
    );

    const content = await readFile(explicitPath, "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    expect((doc["oauth"] as Record<string, unknown>)["access-token"]).toBe("access-via-path");
    // The home default file MUST NOT be created when path is explicit
    await expect(readFile(join(tempDir, ".qontoctl.yaml"), "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("explicit path beats profile (issue #479)", async () => {
    const explicitPath = join(tempDir, "custom.yaml");
    await saveOAuthTokens(
      {
        accessToken: "via-path",
        accessTokenExpiresAt: "2026-12-31T23:59:59Z",
      },
      { path: explicitPath, profile: "acme", home: tempDir },
    );

    expect(await readFile(explicitPath, "utf-8")).toMatch(/access-token: via-path/);
    // Profile-derived path MUST NOT have been created.
    await expect(readFile(join(tempDir, ".qontoctl", "acme.yaml"), "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.skipIf(process.platform === "win32")("creates file with 0o600 permissions", async () => {
    // Windows reports synthesized POSIX modes from the read-only flag, so
    // 0o600 doesn't roundtrip — skip on Windows. Linux + macOS exercise
    // the real permission bits.
    await saveOAuthTokens(
      {
        accessToken: "secret-bearer",
        accessTokenExpiresAt: "2026-12-31T23:59:59Z",
      },
      { home: tempDir },
    );

    const info = await stat(join(tempDir, ".qontoctl.yaml"));
    // Mask off file-type bits; on POSIX 0o600 is owner-rw only.
    expect(info.mode & 0o777).toBe(0o600);
  });
});

describe("saveOAuthClientCredentials", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "qontoctl-writer-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes to home default when no path/profile is given", async () => {
    await saveOAuthClientCredentials({ clientId: "cid", clientSecret: "csecret" }, { home: tempDir });

    const content = await readFile(join(tempDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    expect(oauth["client-id"]).toBe("cid");
    expect(oauth["client-secret"]).toBe("csecret");
  });

  it("preserves existing fields when adding client credentials", async () => {
    await writeFile(join(tempDir, ".qontoctl.yaml"), "api-key:\n  organization-slug: test\n  secret-key: key\n");

    await saveOAuthClientCredentials({ clientId: "cid", clientSecret: "csecret" }, { home: tempDir });

    const content = await readFile(join(tempDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    expect(oauth["client-id"]).toBe("cid");
    expect((doc["api-key"] as Record<string, unknown>)["organization-slug"]).toBe("test");
  });

  it("respects explicit path", async () => {
    const explicitPath = join(tempDir, "explicit.yaml");
    await saveOAuthClientCredentials({ clientId: "cid", clientSecret: "csecret" }, { path: explicitPath });

    const content = await readFile(explicitPath, "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    expect((doc["oauth"] as Record<string, unknown>)["client-id"]).toBe("cid");
  });
});

describe("clearOAuthTokens", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "qontoctl-writer-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("removes token fields but preserves client credentials", async () => {
    const content =
      'oauth:\n  client-id: my-client\n  client-secret: my-secret\n  access-token: old-token\n  refresh-token: old-refresh\n  access-token-expires-at: "2026-02-28T15:00:00Z"\n';
    await writeFile(join(tempDir, ".qontoctl.yaml"), content);

    await clearOAuthTokens({ home: tempDir });

    const result = await readFile(join(tempDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(result) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    expect(oauth["client-id"]).toBe("my-client");
    expect(oauth["client-secret"]).toBe("my-secret");
    expect(oauth["access-token"]).toBeUndefined();
    expect(oauth["refresh-token"]).toBeUndefined();
    expect(oauth["access-token-expires-at"]).toBeUndefined();
  });

  it("removes legacy token-expires-at key", async () => {
    const content =
      'oauth:\n  client-id: my-client\n  client-secret: my-secret\n  access-token: old-token\n  token-expires-at: "2026-02-28T15:00:00Z"\n';
    await writeFile(join(tempDir, ".qontoctl.yaml"), content);

    await clearOAuthTokens({ home: tempDir });

    const result = await readFile(join(tempDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(result) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    expect(oauth["client-id"]).toBe("my-client");
    expect(oauth["token-expires-at"]).toBeUndefined();
    expect(oauth["access-token-expires-at"]).toBeUndefined();
  });

  it("does nothing when config file does not exist", async () => {
    await expect(clearOAuthTokens({ home: tempDir })).resolves.toBeUndefined();
  });

  it("does nothing when no oauth section exists", async () => {
    const content = "api-key:\n  organization-slug: my-org\n";
    await writeFile(join(tempDir, ".qontoctl.yaml"), content);

    await clearOAuthTokens({ home: tempDir });

    const result = await readFile(join(tempDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(result) as Record<string, unknown>;
    expect(doc["api-key"]).toBeDefined();
  });
});

describe("saveOAuthScopes", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "qontoctl-writer-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes scopes to oauth section", async () => {
    const existingContent = "oauth:\n  client-id: my-client\n  client-secret: my-secret\n";
    await writeFile(join(tempDir, ".qontoctl.yaml"), existingContent);

    await saveOAuthScopes(["offline_access", "payment.write"], { home: tempDir });

    const content = await readFile(join(tempDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    expect(oauth["client-id"]).toBe("my-client");
    expect(oauth["client-secret"]).toBe("my-secret");
    expect(oauth["scopes"]).toEqual(["offline_access", "payment.write"]);
  });

  it("creates config file when it does not exist", async () => {
    await saveOAuthScopes(["offline_access"], { home: tempDir });

    const content = await readFile(join(tempDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    expect(oauth["scopes"]).toEqual(["offline_access"]);
  });
});

describe("atomicity and locking (issue #479)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "qontoctl-writer-atomic-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("does not leave a temp file alongside the destination on success", async () => {
    await saveOAuthTokens(
      {
        accessToken: "a",
        accessTokenExpiresAt: "2026-12-31T23:59:59Z",
      },
      { home: tempDir },
    );

    const fs = await import("node:fs/promises");
    const entries = await fs.readdir(tempDir);
    const tmpFiles = entries.filter((e) => /\.qontoctl\.yaml\.tmp\./.test(e));
    expect(tmpFiles).toEqual([]);
  });

  it("permission error during write surfaces as ConfigError PERMISSION", async () => {
    // Make the home directory non-writable so the writer's mkdir + open
    // fail with EACCES. Skip on root (ignores perms) and Windows (different
    // perm model — chmod is best-effort).
    if (process.platform === "win32") {
      return;
    }
    if (process.getuid && process.getuid() === 0) {
      return;
    }

    await chmod(tempDir, 0o500);
    try {
      await expect(
        saveOAuthTokens(
          {
            accessToken: "a",
            accessTokenExpiresAt: "2026-12-31T23:59:59Z",
          },
          { home: tempDir },
        ),
      ).rejects.toBeInstanceOf(ConfigError);
    } finally {
      // Restore so afterEach can clean up
      await chmod(tempDir, 0o700);
    }
  });

  it("concurrent writes serialize correctly (no lost updates)", async () => {
    // Fire two saves at slightly different access tokens; lock should
    // serialize them. Final file must contain ONE of the two tokens
    // verbatim — partial writes / interleaved YAML would fail to parse.
    const explicitPath = join(tempDir, ".qontoctl.yaml");

    const expiresAt = "2026-12-31T23:59:59Z";
    const writeA = saveOAuthTokens({ accessToken: "AAA", accessTokenExpiresAt: expiresAt }, { path: explicitPath });
    const writeB = saveOAuthTokens({ accessToken: "BBB", accessTokenExpiresAt: expiresAt }, { path: explicitPath });

    await Promise.all([writeA, writeB]);

    const content = await readFile(explicitPath, "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    // Whichever ran second wins; both tokens are valid landings.
    expect(["AAA", "BBB"]).toContain(oauth["access-token"]);
  });
});
