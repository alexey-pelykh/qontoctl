// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "./client.js";
import type { GlobalOptions } from "./options.js";

vi.mock("@qontoctl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qontoctl/core")>();
  return {
    ...actual,
    resolveConfig: vi.fn(),
  };
});

const { resolveConfig } = await import("@qontoctl/core");
const resolveConfigMock = vi.mocked(resolveConfig);

describe("createClient", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    resolveConfigMock.mockResolvedValue({
      config: {
        apiKey: {
          organizationSlug: "test-org",
          secretKey: "test-secret",
        },
      },
      warnings: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a client with production base URL by default", async () => {
    const options: GlobalOptions = { output: "table" };
    const client = await createClient(options);
    expect(client).toBeDefined();
  });

  it("passes profile to resolveConfig", async () => {
    const options: GlobalOptions = { output: "table", profile: "work" };
    await createClient(options);
    expect(resolveConfigMock).toHaveBeenCalledWith({ profile: "work" });
  });

  it("prints warnings to stderr", async () => {
    resolveConfigMock.mockResolvedValue({
      config: {
        apiKey: {
          organizationSlug: "test-org",
          secretKey: "test-secret",
        },
      },
      warnings: ["Unknown key: foo"],
    });

    const options: GlobalOptions = { output: "table" };
    await createClient(options);
    expect(stderrSpy).toHaveBeenCalledWith("Warning: Unknown key: foo\n");
  });

  it("throws when config has no API key", async () => {
    resolveConfigMock.mockResolvedValue({
      config: {},
      warnings: [],
    });

    const options: GlobalOptions = { output: "table" };
    await expect(createClient(options)).rejects.toThrow(
      "No API key credentials found in configuration",
    );
  });
});
