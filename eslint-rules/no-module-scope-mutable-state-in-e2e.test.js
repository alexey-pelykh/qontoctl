// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * RuleTester unit tests for the order-independence ESLint rule.
 *
 * Runs under vitest via `pnpm eslint-rules-test` — ESLint's RuleTester
 * delegates to a `describe`/`it` pair set on the class itself, so we
 * wire vitest's into the static slots before invoking `.run()`.
 *
 * Uses the TypeScript-ESLint parser so the rule sees AST nodes
 * identically to how it sees them in production (`*.e2e.test.ts` files).
 */

import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, describe, it } from "vitest";
import rule from "./no-module-scope-mutable-state-in-e2e.js";

// `typescript-eslint` re-exports `@typescript-eslint/parser` as `.parser`.
// We use it to ensure the rule sees AST nodes identically to how it sees
// them when ESLint runs against `*.e2e.test.ts` files in production.
const tsParser = tseslint.parser;

// ESLint RuleTester delegates to mocha-style globals by default. Vitest
// exposes the same functions but they are not global — wire them onto
// the class so `.run()` calls vitest under the hood.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.afterAll = afterAll;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: "latest",
    sourceType: "module",
  },
});

ruleTester.run("no-module-scope-mutable-state-in-e2e", rule, {
  valid: [
    // `const` at module scope is fine — immutable.
    { code: `const FOO = "bar";` },

    // `let` inside `describe` is the legitimate lifecycle pattern.
    {
      code: `
        import { describe, it } from "vitest";
        describe("client CRUD lifecycle", () => {
          let createdClientId: string | undefined;
          it("creates", () => { createdClientId = "x"; });
          it("reads", () => { expect(createdClientId).toBeDefined(); });
        });
      `,
    },

    // `let` inside `it` is fine — fully local to the test.
    {
      code: `
        import { it } from "vitest";
        it("foo", () => { let temp = 1; expect(temp).toBe(1); });
      `,
    },

    // `let` inside a nested function expression is fine.
    {
      code: `
        const make = () => { let counter = 0; return () => ++counter; };
      `,
    },

    // `const` arrow functions and function declarations at module scope are fine.
    {
      code: `
        const helper = () => 42;
        function other() { return 7; }
      `,
    },

    // `let` inside `beforeAll`/`beforeEach` callback is fine.
    {
      code: `
        import { describe, beforeEach } from "vitest";
        describe("foo", () => {
          beforeEach(() => { let setupValue = 1; });
        });
      `,
    },
  ],
  invalid: [
    // Bare module-scope `let` — the canonical bad pattern.
    {
      code: `let createdId: string | undefined;`,
      errors: [
        {
          messageId: "moduleScopeMutable",
          data: { kind: "let", name: "createdId" },
        },
      ],
    },

    // Module-scope `let` with assignment.
    {
      code: `let counter = 0;`,
      errors: [{ messageId: "moduleScopeMutable", data: { kind: "let", name: "counter" } }],
    },

    // Module-scope `var` (legacy, but same hazard).
    {
      code: `var legacyState;`,
      errors: [{ messageId: "moduleScopeMutable", data: { kind: "var", name: "legacyState" } }],
    },

    // Multiple declarations in one statement → one error per declarator.
    {
      code: `let a, b, c;`,
      errors: [
        { messageId: "moduleScopeMutable", data: { kind: "let", name: "a" } },
        { messageId: "moduleScopeMutable", data: { kind: "let", name: "b" } },
        { messageId: "moduleScopeMutable", data: { kind: "let", name: "c" } },
      ],
    },

    // Destructured module-scope `let` — flagged as `<destructured>`.
    {
      code: `let { x, y } = { x: 1, y: 2 };`,
      errors: [{ messageId: "moduleScopeMutable", data: { kind: "let", name: "<destructured>" } }],
    },

    // Module-scope `let` adjacent to `describe` (the smoking-gun shape).
    {
      code: `
        import { describe, it } from "vitest";
        let sharedId: string | undefined;
        describe("foo", () => { it("creates", () => { sharedId = "x"; }); });
        describe("bar", () => { it("reads", () => { expect(sharedId).toBe("x"); }); });
      `,
      errors: [{ messageId: "moduleScopeMutable", data: { kind: "let", name: "sharedId" } }],
    },
  ],
});
