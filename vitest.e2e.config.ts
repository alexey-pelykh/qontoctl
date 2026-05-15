// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.e2e.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    testTimeout: 30_000,
    // E2E tests share a Qonto sandbox; OAuth refresh tokens rotate per RFC 6749 §6,
    // so parallel test files race on token persistence (one writes new token A',
    // another reads stale A and gets 401). Force sequential file execution.
    // (The `--concurrency=1` on turbo in root package.json only limits turbo task
    // parallelism across packages, NOT vitest's intra-package file parallelism.)
    fileParallelism: false,
  },
});
