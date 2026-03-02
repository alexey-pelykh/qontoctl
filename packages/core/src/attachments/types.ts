// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * An attachment as returned by the Qonto API.
 */
export interface Attachment {
  readonly id: string;
  readonly file_name: string;
  readonly file_size: number;
  readonly file_content_type: string;
  readonly url: string;
  readonly created_at: string;
}
