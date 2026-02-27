// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * File metadata for a bank statement.
 */
export interface StatementFile {
  readonly file_name: string;
  readonly file_content_type: string;
  readonly file_size: string;
  readonly file_url: string;
}

/**
 * A bank statement from the Qonto API.
 */
export interface Statement {
  readonly id: string;
  readonly bank_account_id: string;
  readonly period: string;
  readonly file: StatementFile;
}
