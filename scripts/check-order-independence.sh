#!/usr/bin/env bash

# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2026 Oleksii PELYKH

# Pre-release order-independence detector for the E2E suite (epic #603
# §8.3, R-OI-1).
#
# Runs `pnpm test:e2e` twice — once in default file order, once with
# `--sequence.shuffle.files` enabled — captures the vitest JSON reporter
# outcomes, and diffs the pass/fail/skip classification per test (via
# scripts/diff-vitest-runs.js). A test whose outcome changes across runs
# indicates cross-test state contamination (in-process or sandbox-level)
# and is flagged for state-isolation review (R-OI-2).
#
# Skip-reason text may legitimately differ across runs (a CRUD-chain
# upstream-skipped cascade flips to feature-not-supported when the
# upstream becomes the first test, etc.); the pass/fail/skip _membership_
# may not.
#
# Usage:
#   pnpm order-independence-check                   # random seed, both runs
#   VITEST_SHUFFLE_SEED=42 pnpm order-independence-check   # reproducible seed
#   KEEP_REPORTS=1 pnpm order-independence-check    # do not delete .tmp/order-check/*.json
#
# Exit codes:
#   0 — no divergence; suite is order-independent
#   1 — divergence detected (divergent tests listed on stderr)
#   2 — usage error or one of the runs could not produce a report
#
# Prerequisites:
#   - Whatever credentials the suite needs (api-key for production, OAuth
#     for sandbox) must be configured per docs/e2e-testing.md.
#   - The suite is sequential (`fileParallelism: false` in
#     vitest.e2e.config.ts), so the two runs are wall-clock back-to-back;
#     budget ~2x the normal E2E duration.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${REPO_ROOT}/.tmp/order-check"
RUN1="${OUT_DIR}/run-default.json"
RUN2="${OUT_DIR}/run-shuffled.json"
SEED="${VITEST_SHUFFLE_SEED:-${RANDOM}}"

mkdir -p "${OUT_DIR}"
# Remove any prior report so a vitest invocation that never reaches the
# reporter stage (build error, signal) does not leave stale data for the
# diff helper.
rm -f "${RUN1}" "${RUN2}"

echo "==> [1/3] Running E2E suite in default file order"
echo "          → ${RUN1}"
# `|| true` because tests legitimately fail/skip; the diff helper reads
# the report regardless of vitest's exit status. The reporter writes the
# report on test completion, not on success.
(cd "${REPO_ROOT}" && pnpm test:e2e -- --reporter=json --outputFile="${RUN1}") || true

if [[ ! -s "${RUN1}" ]]; then
  echo "Error: run 1 did not produce a JSON report at ${RUN1}." >&2
  echo "       Inspect the output above for build/setup failures." >&2
  exit 2
fi

echo
echo "==> [2/3] Running E2E suite shuffled (seed=${SEED})"
echo "          → ${RUN2}"
(cd "${REPO_ROOT}" && pnpm test:e2e -- \
  --reporter=json \
  --outputFile="${RUN2}" \
  --sequence.shuffle.files \
  --sequence.seed="${SEED}") || true

if [[ ! -s "${RUN2}" ]]; then
  echo "Error: run 2 did not produce a JSON report at ${RUN2}." >&2
  exit 2
fi

echo
echo "==> [3/3] Diffing outcomes (seed=${SEED})"
echo
set +e
node "${REPO_ROOT}/scripts/diff-vitest-runs.js" "${RUN1}" "${RUN2}"
diff_exit=$?
set -e

if [[ "${KEEP_REPORTS:-0}" != "1" ]]; then
  rm -f "${RUN1}" "${RUN2}"
fi

if [[ ${diff_exit} -ne 0 ]]; then
  echo
  echo "Seed used for shuffled run: ${SEED}"
  echo "Re-run with VITEST_SHUFFLE_SEED=${SEED} to reproduce the same shuffle."
  echo "Pass KEEP_REPORTS=1 to retain the JSON reports for inspection."
fi

exit ${diff_exit}
