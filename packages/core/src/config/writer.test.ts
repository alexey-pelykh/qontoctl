// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveOAuthTokens, saveOAuthClientCredentials, clearOAuthTokens } from "./writer.js";

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
        tokenExpiresAt: "2026-02-28T16:00:00Z",
      },
      { home: tempDir, cwd: tempDir },
    );

    const content = await readFile(join(tempDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    expect(oauth["access-token"]).toBe("access-123");
    expect(oauth["refresh-token"]).toBe("refresh-456");
    expect(oauth["token-expires-at"]).toBe("2026-02-28T16:00:00Z");
  });

  it("preserves existing config fields", async () => {
    const existingContent = "api-key:\n  organization-slug: my-org\n  secret-key: my-key\n";
    await writeFile(join(tempDir, ".qontoctl.yaml"), existingContent);

    await saveOAuthTokens(
      {
        accessToken: "access-123",
        tokenExpiresAt: "2026-02-28T16:00:00Z",
      },
      { home: tempDir, cwd: tempDir },
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
        tokenExpiresAt: "2026-02-28T16:00:00Z",
      },
      { home: tempDir, cwd: tempDir },
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
        tokenExpiresAt: "2026-02-28T16:00:00Z",
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
        tokenExpiresAt: "2026-02-28T16:00:00Z",
      },
      { home: tempDir, cwd: tempDir },
    );

    const content = await readFile(join(tempDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    expect(oauth["refresh-token"]).toBeUndefined();
  });
});

describe("saveOAuthClientCredentials", () => {
  let cwdDir: string;
  let homeDir: string;

  beforeEach(async () => {
    cwdDir = await mkdtemp(join(tmpdir(), "qontoctl-writer-cwd-"));
    homeDir = await mkdtemp(join(tmpdir(), "qontoctl-writer-home-"));
  });

  afterEach(async () => {
    await rm(cwdDir, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
  });

  it("writes to CWD config when it exists", async () => {
    // CWD has a config file already
    await writeFile(join(cwdDir, ".qontoctl.yaml"), "api-key:\n  organization-slug: test\n  secret-key: key\n");

    await saveOAuthClientCredentials({ clientId: "cid", clientSecret: "csecret" }, { home: homeDir, cwd: cwdDir });

    const content = await readFile(join(cwdDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    expect(oauth["client-id"]).toBe("cid");
    expect(oauth["client-secret"]).toBe("csecret");
    // Home config should NOT have been created
    await expect(readFile(join(homeDir, ".qontoctl.yaml"), "utf-8")).rejects.toThrow();
  });

  it("falls back to home config when CWD has no config", async () => {
    await saveOAuthClientCredentials({ clientId: "cid", clientSecret: "csecret" }, { home: homeDir, cwd: cwdDir });

    const content = await readFile(join(homeDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(content) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    expect(oauth["client-id"]).toBe("cid");
    expect(oauth["client-secret"]).toBe("csecret");
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
      'oauth:\n  client-id: my-client\n  client-secret: my-secret\n  access-token: old-token\n  refresh-token: old-refresh\n  token-expires-at: "2026-02-28T15:00:00Z"\n';
    await writeFile(join(tempDir, ".qontoctl.yaml"), content);

    await clearOAuthTokens({ home: tempDir, cwd: tempDir });

    const result = await readFile(join(tempDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(result) as Record<string, unknown>;
    const oauth = doc["oauth"] as Record<string, unknown>;
    expect(oauth["client-id"]).toBe("my-client");
    expect(oauth["client-secret"]).toBe("my-secret");
    expect(oauth["access-token"]).toBeUndefined();
    expect(oauth["refresh-token"]).toBeUndefined();
    expect(oauth["token-expires-at"]).toBeUndefined();
  });

  it("does nothing when config file does not exist", async () => {
    await expect(clearOAuthTokens({ home: tempDir, cwd: tempDir })).resolves.toBeUndefined();
  });

  it("does nothing when no oauth section exists", async () => {
    const content = "api-key:\n  organization-slug: my-org\n";
    await writeFile(join(tempDir, ".qontoctl.yaml"), content);

    await clearOAuthTokens({ home: tempDir, cwd: tempDir });

    const result = await readFile(join(tempDir, ".qontoctl.yaml"), "utf-8");
    const doc = parseYaml(result) as Record<string, unknown>;
    expect(doc["api-key"]).toBeDefined();
  });
});
