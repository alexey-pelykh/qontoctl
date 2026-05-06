// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { applyEnvOverlay } from "./env.js";

describe("applyEnvOverlay", () => {
  it("returns config unchanged when no env vars are set", () => {
    const config = {
      apiKey: { organizationSlug: "file-org", secretKey: "file-secret" },
    };
    const result = applyEnvOverlay(config, { env: {} });
    expect(result).toEqual(config);
  });

  it("overlays bare env vars without profile", () => {
    const config = {
      apiKey: { organizationSlug: "file-org", secretKey: "file-secret" },
    };
    const result = applyEnvOverlay(config, {
      env: {
        QONTOCTL_ORGANIZATION_SLUG: "env-org",
        QONTOCTL_SECRET_KEY: "env-secret",
      },
    });
    expect(result.apiKey).toEqual({
      organizationSlug: "env-org",
      secretKey: "env-secret",
    });
  });

  it("partially overlays env vars", () => {
    const config = {
      apiKey: { organizationSlug: "file-org", secretKey: "file-secret" },
    };
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_ORGANIZATION_SLUG: "env-org" },
    });
    expect(result.apiKey).toEqual({
      organizationSlug: "env-org",
      secretKey: "file-secret",
    });
  });

  it("overlays named profile env vars", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      profile: "staging",
      env: {
        QONTOCTL_STAGING_ORGANIZATION_SLUG: "staging-org",
        QONTOCTL_STAGING_SECRET_KEY: "staging-secret",
      },
    });
    expect(result.apiKey).toEqual({
      organizationSlug: "staging-org",
      secretKey: "staging-secret",
    });
  });

  it("normalizes hyphenated profile names to underscores", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      profile: "my-profile",
      env: {
        QONTOCTL_MY_PROFILE_ORGANIZATION_SLUG: "org",
        QONTOCTL_MY_PROFILE_SECRET_KEY: "secret",
      },
    });
    expect(result.apiKey).toEqual({
      organizationSlug: "org",
      secretKey: "secret",
    });
  });

  it("creates apiKey from env vars when config has none", () => {
    const result = applyEnvOverlay(
      {},
      {
        env: {
          QONTOCTL_ORGANIZATION_SLUG: "env-org",
          QONTOCTL_SECRET_KEY: "env-secret",
        },
      },
    );
    expect(result.apiKey).toEqual({
      organizationSlug: "env-org",
      secretKey: "env-secret",
    });
  });

  it("defaults secretKey to empty string when only ORGANIZATION_SLUG env var is set and no existing apiKey", () => {
    const result = applyEnvOverlay(
      {},
      {
        env: { QONTOCTL_ORGANIZATION_SLUG: "env-org" },
      },
    );
    expect(result.apiKey).toEqual({
      organizationSlug: "env-org",
      secretKey: "",
    });
  });

  it("defaults organizationSlug to empty string when only SECRET_KEY env var is set and no existing apiKey", () => {
    const result = applyEnvOverlay(
      {},
      {
        env: { QONTOCTL_SECRET_KEY: "env-secret" },
      },
    );
    expect(result.apiKey).toEqual({
      organizationSlug: "",
      secretKey: "env-secret",
    });
  });

  it("env var overrides file value for one field only", () => {
    const config = {
      apiKey: { organizationSlug: "file-org", secretKey: "file-secret" },
    };
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_SECRET_KEY: "env-secret" },
    });
    expect(result.apiKey).toEqual({
      organizationSlug: "file-org",
      secretKey: "env-secret",
    });
  });

  it("ignores bare env vars when profile is specified", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      profile: "staging",
      env: {
        QONTOCTL_ORGANIZATION_SLUG: "bare-org",
        QONTOCTL_SECRET_KEY: "bare-secret",
      },
    });
    // With profile "staging", it looks for QONTOCTL_STAGING_* not QONTOCTL_*
    expect(result).toEqual({});
  });

  it("does not mutate the original config", () => {
    const config = {
      apiKey: { organizationSlug: "file-org", secretKey: "file-secret" },
    };
    const original = structuredClone(config);
    applyEnvOverlay(config, {
      env: { QONTOCTL_ORGANIZATION_SLUG: "env-org" },
    });
    expect(config).toEqual(original);
  });

  it("overlays QONTOCTL_ENDPOINT env var", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_ENDPOINT: "https://custom.example.com" },
    });
    expect(result.endpoint).toBe("https://custom.example.com");
  });

  it("overlays profile-scoped endpoint env var", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      profile: "staging",
      env: { QONTOCTL_STAGING_ENDPOINT: "https://staging.example.com" },
    });
    expect(result.endpoint).toBe("https://staging.example.com");
  });

  it("endpoint env var overrides file endpoint", () => {
    const config = { endpoint: "https://file.example.com" };
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_ENDPOINT: "https://env.example.com" },
    });
    expect(result.endpoint).toBe("https://env.example.com");
  });

  it("overlays QONTOCTL_STAGING_TOKEN env var into oauth section", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_STAGING_TOKEN: "tok_abc123" },
    });
    expect(result.oauth?.stagingToken).toBe("tok_abc123");
  });

  it("creates oauth section when staging token env var is set but no oauth in config", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_STAGING_TOKEN: "tok_abc123" },
    });
    expect(result.oauth).toBeDefined();
    expect(result.oauth?.clientId).toBe("");
    expect(result.oauth?.clientSecret).toBe("");
    expect(result.oauth?.stagingToken).toBe("tok_abc123");
  });

  it("overlays profile-scoped staging token env var into oauth section", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      profile: "staging",
      env: { QONTOCTL_STAGING_STAGING_TOKEN: "tok_staging" },
    });
    expect(result.oauth?.stagingToken).toBe("tok_staging");
  });

  it("staging token env var overrides file staging token in oauth", () => {
    const config = {
      oauth: { clientId: "cid", clientSecret: "csecret", stagingToken: "file_token" },
    };
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_STAGING_TOKEN: "env_token" },
    });
    expect(result.oauth?.stagingToken).toBe("env_token");
  });

  it("preserves existing oauth fields when staging token env var is set", () => {
    const config = {
      oauth: {
        clientId: "cid",
        clientSecret: "csecret",
        accessToken: "at",
        refreshToken: "rt",
        accessTokenExpiresAt: "2026-01-01T00:00:00Z",
        scopes: ["offline_access"],
      },
    };
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_STAGING_TOKEN: "tok_abc123" },
    });
    expect(result.oauth?.clientId).toBe("cid");
    expect(result.oauth?.clientSecret).toBe("csecret");
    expect(result.oauth?.accessToken).toBe("at");
    expect(result.oauth?.refreshToken).toBe("rt");
    expect(result.oauth?.accessTokenExpiresAt).toBe("2026-01-01T00:00:00Z");
    expect(result.oauth?.scopes).toEqual(["offline_access"]);
    expect(result.oauth?.stagingToken).toBe("tok_abc123");
  });

  it("overlays QONTOCTL_ACCESS_TOKEN env var", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_ACCESS_TOKEN: "at_env123" },
    });
    expect(result.oauth?.accessToken).toBe("at_env123");
  });

  it("overlays QONTOCTL_REFRESH_TOKEN env var", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_REFRESH_TOKEN: "rt_env456" },
    });
    expect(result.oauth?.refreshToken).toBe("rt_env456");
  });

  it("access token env var overrides file access token", () => {
    const config = {
      oauth: { clientId: "cid", clientSecret: "csecret", accessToken: "file_at" },
    };
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_ACCESS_TOKEN: "env_at" },
    });
    expect(result.oauth?.accessToken).toBe("env_at");
  });

  it("overlays profile-scoped access token", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      profile: "staging",
      env: { QONTOCTL_STAGING_ACCESS_TOKEN: "at_staging" },
    });
    expect(result.oauth?.accessToken).toBe("at_staging");
  });

  it("returns config unchanged when no staging token env var is set", () => {
    const config = {
      oauth: { clientId: "cid", clientSecret: "csecret", stagingToken: "file_token" },
    };
    const result = applyEnvOverlay(config, { env: {} });
    expect(result.oauth?.stagingToken).toBe("file_token");
  });

  it("overlays QONTOCTL_SCA_METHOD env var into sca section", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_SCA_METHOD: "passkey" },
    });
    expect(result.sca?.method).toBe("passkey");
  });

  it("creates sca section when SCA_METHOD env var is set but no sca in config", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_SCA_METHOD: "mock" },
    });
    expect(result.sca).toBeDefined();
    expect(result.sca?.method).toBe("mock");
  });

  it("SCA_METHOD env var overrides file sca.method", () => {
    const config = { sca: { method: "passkey" } };
    const result = applyEnvOverlay(config, {
      env: { QONTOCTL_SCA_METHOD: "sms-otp" },
    });
    expect(result.sca?.method).toBe("sms-otp");
  });

  it("overlays profile-scoped SCA_METHOD env var", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      profile: "staging",
      env: { QONTOCTL_STAGING_SCA_METHOD: "mock" },
    });
    expect(result.sca?.method).toBe("mock");
  });

  it("returns config unchanged when no SCA_METHOD env var is set", () => {
    const config = { sca: { method: "passkey" } };
    const result = applyEnvOverlay(config, { env: {} });
    expect(result.sca?.method).toBe("passkey");
  });

  it("ignores bare SCA_METHOD when profile is specified", () => {
    const config = {};
    const result = applyEnvOverlay(config, {
      profile: "staging",
      env: { QONTOCTL_SCA_METHOD: "mock" },
    });
    expect(result.sca).toBeUndefined();
  });
});
