// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import headerPlugin from "@tony.ganchev/eslint-plugin-header";
import noModuleScopeMutableStateInE2e from "./eslint-rules/no-module-scope-mutable-state-in-e2e.js";

// Local rules bundled into one plugin namespace for clarity.
// New rules under `eslint-rules/` are wired here.
const qontoctlPlugin = {
  rules: {
    "no-module-scope-mutable-state-in-e2e": noModuleScopeMutableStateInE2e,
  },
};

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  eslintConfigPrettier,
  {
    ignores: ["**/dist/"],
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.e2e.test.ts"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Order-independence invariant enforcement — see
    // `docs/e2e-testing.md` § Order-independence invariant and
    // `docs/designs/e2e-test-reliability.md` §8.3.
    files: ["**/*.e2e.test.ts"],
    plugins: { qontoctl: qontoctlPlugin },
    rules: {
      "qontoctl/no-module-scope-mutable-state-in-e2e": "error",
    },
  },
  {
    plugins: {
      header: headerPlugin,
    },
    rules: {
      "header/header": [
        "error",
        "line",
        [" SPDX-License-Identifier: AGPL-3.0-only", " Copyright (C) 2026 Oleksii PELYKH"],
      ],
    },
  },
);
