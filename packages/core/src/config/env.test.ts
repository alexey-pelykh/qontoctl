// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import { applyEnvOverlay } from "./env.js";

describe("applyEnvOverlay", () => {
  it("returns config unchanged when no env vars are set", () => {
    const config = {
      apiKey: { organizationSlug: "file-org", secretKey: "file-secret" },
    };
    const { config: result, accessTokenFromEnv } = applyEnvOverlay(config, { env: {} });
    expect(result).toEqual(config);
    expect(accessTokenFromEnv).toBe(false);
  });

  it("overlays bare env vars without profile", () => {
    const config = {
      apiKey: { organizationSlug: "file-org", secretKey: "file-secret" },
    };
    const { config: result } = applyEnvOverlay(config, {
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
    const { config: result } = applyEnvOverlay(config, {
      env: { QONTOCTL_ORGANIZATION_SLUG: "env-org" },
    });
    expect(result.apiKey).toEqual({
      organizationSlug: "env-org",
      secretKey: "file-secret",
    });
  });

  it("overlays named profile env vars", () => {
    const config = {};
    const { config: result } = applyEnvOverlay(config, {
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
    const { config: result } = applyEnvOverlay(config, {
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
    const { config: result } = applyEnvOverlay(
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
    const { config: result } = applyEnvOverlay(
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
    const { config: result } = applyEnvOverlay(
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
    const { config: result } = applyEnvOverlay(config, {
      env: { QONTOCTL_SECRET_KEY: "env-secret" },
    });
    expect(result.apiKey).toEqual({
      organizationSlug: "file-org",
      secretKey: "env-secret",
    });
  });

  it("ignores bare env vars when profile is specified", () => {
    const config = {};
    const { config: result } = applyEnvOverlay(config, {
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
    const { config: result } = applyEnvOverlay(config, {
      env: { QONTOCTL_ENDPOINT: "https://custom.example.com" },
    });
    expect(result.endpoint).toBe("https://custom.example.com");
  });

  it("overlays profile-scoped endpoint env var", () => {
    const config = {};
    const { config: result } = applyEnvOverlay(config, {
      profile: "staging",
      env: { QONTOCTL_STAGING_ENDPOINT: "https://staging.example.com" },
    });
    expect(result.endpoint).toBe("https://staging.example.com");
  });

  it("endpoint env var overrides file endpoint", () => {
    const config = { endpoint: "https://file.example.com" };
    const { config: result } = applyEnvOverlay(config, {
      env: { QONTOCTL_ENDPOINT: "https://env.example.com" },
    });
    expect(result.endpoint).toBe("https://env.example.com");
  });

  it("overlays QONTOCTL_STAGING_TOKEN env var when file supplies client creds", () => {
    // Post-#479: a staging token without resolvable client creds is
    // dropped (the resolver surfaces NO_CREDS). With file-supplied client
    // creds, the env staging token attaches as expected.
    const config = {
      oauth: { clientId: "cid", clientSecret: "csecret" },
    };
    const { config: result } = applyEnvOverlay(config, {
      env: { QONTOCTL_STAGING_TOKEN: "tok_abc123" },
    });
    expect(result.oauth?.stagingToken).toBe("tok_abc123");
  });

  it("does NOT create an oauth section when only staging-token env var is set (issue #479)", () => {
    // A staging token alone is meaningless — the sandbox endpoint is
    // OAuth-only. Attaching it to a synthesized oauth block with empty
    // client creds would produce an unusable record and surface a
    // misleading "missing client-id" downstream. Drop instead.
    const config = {};
    const { config: result } = applyEnvOverlay(config, {
      env: { QONTOCTL_STAGING_TOKEN: "tok_abc123" },
    });
    expect(result.oauth).toBeUndefined();
  });

  it("staging-token env var attaches when file supplies client creds", () => {
    const config = {
      oauth: { clientId: "cid", clientSecret: "csecret" },
    };
    const { config: result } = applyEnvOverlay(config, {
      env: { QONTOCTL_STAGING_TOKEN: "tok_abc123" },
    });
    expect(result.oauth?.stagingToken).toBe("tok_abc123");
    expect(result.oauth?.clientId).toBe("cid");
  });

  it("staging-token env var attaches when env supplies client creds in same overlay", () => {
    const config = {};
    const { config: result } = applyEnvOverlay(config, {
      env: {
        QONTOCTL_CLIENT_ID: "cid",
        QONTOCTL_CLIENT_SECRET: "csecret",
        QONTOCTL_STAGING_TOKEN: "tok_abc123",
      },
    });
    expect(result.oauth?.stagingToken).toBe("tok_abc123");
    expect(result.oauth?.clientId).toBe("cid");
  });

  it("does NOT attach profile-scoped staging-token without client creds (issue #479)", () => {
    const config = {};
    const { config: result } = applyEnvOverlay(config, {
      profile: "staging",
      env: { QONTOCTL_STAGING_STAGING_TOKEN: "tok_staging" },
    });
    expect(result.oauth).toBeUndefined();
  });

  it("staging token env var overrides file staging token in oauth", () => {
    const config = {
      oauth: { clientId: "cid", clientSecret: "csecret", stagingToken: "file_token" },
    };
    const { config: result } = applyEnvOverlay(config, {
      env: { QONTOCTL_STAGING_TOKEN: "env_token" },
    });
    expect(result.oauth?.stagingToken).toBe("env_token");
  });

  it("preserves existing static oauth fields when staging token env var is set", () => {
    const config = {
      oauth: {
        clientId: "cid",
        clientSecret: "csecret",
        accessToken: "at",
      },
    };
    const { config: result } = applyEnvOverlay(config, {
      env: { QONTOCTL_STAGING_TOKEN: "tok_abc123" },
    });
    expect(result.oauth?.clientId).toBe("cid");
    expect(result.oauth?.clientSecret).toBe("csecret");
    expect(result.oauth?.accessToken).toBe("at");
    expect(result.oauth?.stagingToken).toBe("tok_abc123");
  });

  it("does NOT synthesize oauth when only QONTOCTL_ACCESS_TOKEN is set (issue #479)", () => {
    // Pre-#479: synthesized oauth { clientId: '', clientSecret: '',
    // accessToken } which then surfaced "Missing required field
    // 'client-id'" downstream — misleading: the user only wanted an
    // access-token override. Post-#479: leave oauth undefined; downstream
    // NO_CREDS surfaces accurately. The flag is still raised so a caller
    // that DOES have file oauth identity can honor read-only semantics.
    const config = {};
    const { config: result, accessTokenFromEnv } = applyEnvOverlay(config, {
      env: { QONTOCTL_ACCESS_TOKEN: "at_env123" },
    });
    expect(result.oauth).toBeUndefined();
    expect(accessTokenFromEnv).toBe(true);
  });

  it("access-token env var overrides file access token when file supplies client creds", () => {
    const config = {
      oauth: { clientId: "cid", clientSecret: "csecret", accessToken: "file_at" },
    };
    const { config: result, accessTokenFromEnv } = applyEnvOverlay(config, {
      env: { QONTOCTL_ACCESS_TOKEN: "env_at" },
    });
    expect(result.oauth?.accessToken).toBe("env_at");
    expect(result.oauth?.clientId).toBe("cid");
    expect(accessTokenFromEnv).toBe(true);
  });

  it("access-token env var combines with env client creds in same overlay", () => {
    const config = {};
    const { config: result, accessTokenFromEnv } = applyEnvOverlay(config, {
      env: {
        QONTOCTL_CLIENT_ID: "cid",
        QONTOCTL_CLIENT_SECRET: "csecret",
        QONTOCTL_ACCESS_TOKEN: "env_at",
      },
    });
    expect(result.oauth?.accessToken).toBe("env_at");
    expect(result.oauth?.clientId).toBe("cid");
    expect(accessTokenFromEnv).toBe(true);
  });

  it("does NOT synthesize oauth from profile-scoped access-token alone (issue #479)", () => {
    const config = {};
    const { config: result, accessTokenFromEnv } = applyEnvOverlay(config, {
      profile: "staging",
      env: { QONTOCTL_STAGING_ACCESS_TOKEN: "at_staging" },
    });
    expect(result.oauth).toBeUndefined();
    expect(accessTokenFromEnv).toBe(true);
  });

  it("ignores QONTOCTL_REFRESH_TOKEN env var (refresh-tokens are runtime-mutable, never env-overridable)", () => {
    const config = {};
    const { config: result, accessTokenFromEnv } = applyEnvOverlay(config, {
      env: { QONTOCTL_REFRESH_TOKEN: "rt_env456" },
    });
    // env-overlay does not create an oauth section from a stray refresh token
    expect(result.oauth).toBeUndefined();
    expect(accessTokenFromEnv).toBe(false);
  });

  it("ignores profile-scoped QONTOCTL_{PROFILE}_REFRESH_TOKEN env var", () => {
    const config = {};
    const { config: result } = applyEnvOverlay(config, {
      profile: "staging",
      env: { QONTOCTL_STAGING_REFRESH_TOKEN: "rt_env789" },
    });
    expect(result.oauth).toBeUndefined();
  });

  it("does not let QONTOCTL_REFRESH_TOKEN shadow a file refresh token", () => {
    const config = {
      oauth: {
        clientId: "cid",
        clientSecret: "csecret",
      },
    };
    const { config: result } = applyEnvOverlay(config, {
      env: { QONTOCTL_REFRESH_TOKEN: "env_rt_should_be_ignored" },
    });
    // Env did not set refresh-token; the static-fields-only output also
    // does not carry refresh-token (it is a runtime-mutable field handled
    // separately by the resolver from file state).
    expect(result.oauth).toBeDefined();
    expect("refreshToken" in (result.oauth ?? {})).toBe(false);
  });

  it("returns config unchanged when no staging token env var is set", () => {
    const config = {
      oauth: { clientId: "cid", clientSecret: "csecret", stagingToken: "file_token" },
    };
    const { config: result } = applyEnvOverlay(config, { env: {} });
    expect(result.oauth?.stagingToken).toBe("file_token");
  });

  it("overlays QONTOCTL_SCA_METHOD env var into sca section", () => {
    const config = {};
    const { config: result } = applyEnvOverlay(config, {
      env: { QONTOCTL_SCA_METHOD: "passkey" },
    });
    expect(result.sca?.method).toBe("passkey");
  });

  it("creates sca section when SCA_METHOD env var is set but no sca in config", () => {
    const config = {};
    const { config: result } = applyEnvOverlay(config, {
      env: { QONTOCTL_SCA_METHOD: "mock" },
    });
    expect(result.sca).toBeDefined();
    expect(result.sca?.method).toBe("mock");
  });

  it("SCA_METHOD env var overrides file sca.method", () => {
    const config = { sca: { method: "passkey" } };
    const { config: result } = applyEnvOverlay(config, {
      env: { QONTOCTL_SCA_METHOD: "sms-otp" },
    });
    expect(result.sca?.method).toBe("sms-otp");
  });

  it("overlays profile-scoped SCA_METHOD env var", () => {
    const config = {};
    const { config: result } = applyEnvOverlay(config, {
      profile: "staging",
      env: { QONTOCTL_STAGING_SCA_METHOD: "mock" },
    });
    expect(result.sca?.method).toBe("mock");
  });

  it("returns config unchanged when no SCA_METHOD env var is set", () => {
    const config = { sca: { method: "passkey" } };
    const { config: result } = applyEnvOverlay(config, { env: {} });
    expect(result.sca?.method).toBe("passkey");
  });

  it("ignores bare SCA_METHOD when profile is specified", () => {
    const config = {};
    const { config: result } = applyEnvOverlay(config, {
      profile: "staging",
      env: { QONTOCTL_SCA_METHOD: "mock" },
    });
    expect(result.sca).toBeUndefined();
  });

  it("accessTokenFromEnv is false when env supplies only static (non-token) fields", () => {
    const { accessTokenFromEnv } = applyEnvOverlay(
      {},
      {
        env: {
          QONTOCTL_CLIENT_ID: "cid",
          QONTOCTL_CLIENT_SECRET: "csecret",
          QONTOCTL_STAGING_TOKEN: "tok",
        },
      },
    );
    expect(accessTokenFromEnv).toBe(false);
  });

  describe("QONTOCTL_AUTH", () => {
    it.each(["api-key", "api-key-first", "oauth", "oauth-first"] as const)(
      "overlays valid value %s from bare env var",
      (value) => {
        const { config: result } = applyEnvOverlay({}, { env: { QONTOCTL_AUTH: value } });
        expect(result.auth?.preference).toBe(value);
      },
    );

    it("env preference overrides file preference", () => {
      const { config: result } = applyEnvOverlay(
        { auth: { preference: "oauth-first" } },
        { env: { QONTOCTL_AUTH: "api-key" } },
      );
      expect(result.auth?.preference).toBe("api-key");
    });

    it("silently drops invalid env value (CLI flag's choices() catches typos at parse time)", () => {
      const { config: result } = applyEnvOverlay(
        {},
        { env: { QONTOCTL_AUTH: "api-key-only" } }, // common typo
      );
      // Falls through with no auth preference set; resolveAuthPreference's
      // default (`oauth-first`) will kick in downstream.
      expect(result.auth).toBeUndefined();
    });

    it("overlays profile-scoped variant", () => {
      const { config: result } = applyEnvOverlay(
        {},
        {
          profile: "staging",
          env: { QONTOCTL_STAGING_AUTH: "oauth" },
        },
      );
      expect(result.auth?.preference).toBe("oauth");
    });

    it("ignores bare QONTOCTL_AUTH when profile is specified", () => {
      const { config: result } = applyEnvOverlay(
        {},
        {
          profile: "staging",
          env: { QONTOCTL_AUTH: "api-key" },
        },
      );
      expect(result.auth).toBeUndefined();
    });

    it("preserves existing auth fields when only some are env-supplied", () => {
      // Today there is only `preference` under auth, so this just verifies the
      // spread doesn't drop the field. When the auth namespace grows, the
      // pattern is already in place.
      const { config: result } = applyEnvOverlay(
        { auth: { preference: "api-key" } },
        { env: { QONTOCTL_AUTH: "oauth" } },
      );
      expect(result.auth?.preference).toBe("oauth");
    });
  });
});
