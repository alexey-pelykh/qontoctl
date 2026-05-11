// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * A fully-populated attachment as returned by `GET /v2/attachments/{id}` and
 * by the attachment list/show endpoints.
 */
export interface Attachment {
  readonly id: string;
  readonly file_name: string;
  readonly file_size: string;
  readonly file_content_type: string;
  readonly url: string;
  readonly created_at: string;
}

/**
 * The minimal shape returned by `POST /v2/attachments` (standalone upload).
 *
 * The Qonto API's standalone upload endpoint returns ONLY the attachment ID —
 * the other fields (`file_name`, `file_size`, `file_content_type`, `url`,
 * `created_at`) require a follow-up `GET /v2/attachments/{id}` to populate.
 */
export interface UploadedAttachment {
  readonly id: string;
}
