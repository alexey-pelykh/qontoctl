// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Local ESLint rule enforcing the order-independence invariant in E2E
 * tests (epic #603 §8.3, R-OI-2).
 *
 * Flags `let` and `var` declarations at the top level (Program scope) of
 * `*.e2e.test.ts` files. Module-scope mutable bindings introduce
 * test-order dependence: vitest loads each test file once per worker, so
 * a binding populated by one `it()` callback is visible to every
 * subsequent `it()` in the file. When the order matters and nobody
 * designed it to, a test failure may flip to pass on re-run — the silent
 * flake that hid #496 for ~2 weeks.
 *
 * The lifecycle-`describe` pattern keeps shared state local to a single
 * `describe` whose `it()` blocks are intentionally ordered (see
 * `docs/e2e-testing.md` § Order-independence invariant).
 *
 * Module-scope `const` is fine (immutable, cannot create order
 * dependence). Module-scope `function` declarations are fine
 * (pure-by-convention; mutation through them would still need a
 * top-level binding to mutate, which this rule catches).
 *
 * The rule trusts ESLint's `files:` glob to scope its activation —
 * applying it to non-E2E `.ts` files would be over-broad (production
 * code uses module-scope `let` legitimately, e.g. lazy singletons).
 *
 * @type {import("eslint").Rule.RuleModule}
 */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow module-scope mutable bindings (`let`, `var`) in E2E test files",
    },
    schema: [],
    messages: {
      moduleScopeMutable:
        "Module-scope `{{kind}} {{name}}` in an E2E test file introduces " +
        "test-order dependence (epic #603 R-OI-2). Move the binding inside " +
        "the relevant `describe(...)` block (CRUD-lifecycle pattern with " +
        "LifecycleSkipCarrier — see docs/e2e-testing.md § Order-independence " +
        "invariant) or change to `const`.",
    },
  },
  create(context) {
    return {
      Program(node) {
        for (const stmt of node.body) {
          if (stmt.type !== "VariableDeclaration") continue;
          if (stmt.kind !== "let" && stmt.kind !== "var") continue;
          for (const decl of stmt.declarations) {
            const name = decl.id.type === "Identifier" ? decl.id.name : "<destructured>";
            context.report({
              node: decl,
              messageId: "moduleScopeMutable",
              data: { kind: stmt.kind, name },
            });
          }
        }
      },
    };
  },
};

export default rule;
