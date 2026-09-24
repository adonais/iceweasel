/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Kept apart from jsonl-utils.mjs, and free of any import, because the JSON
// View sniffer runs on every top level document load and must not pull the
// reps library in with it.

/**
 * Regular expression source matching the content types used for JSON Lines:
 * application/jsonl (the standard type), plus the text/jsonl,
 * application/jsonlines and application/x-ndjson alternate spellings.
 * Exported as a source string so consumers can compose it with their own
 * patterns.
 */
export const JSONL_MIME_TYPE_PATTERN =
  "text\\/jsonl|application\\/(?:jsonl|jsonlines|x-ndjson)";

const JSONL_MIME_TYPE_REGEX = new RegExp(`^(?:${JSONL_MIME_TYPE_PATTERN})$`);

/**
 * @param {string} contentType
 *        A bare content type, without any parameter (no "; charset=utf-8").
 * @returns {boolean}
 */
export function isJsonlMimeType(contentType) {
  return JSONL_MIME_TYPE_REGEX.test(contentType);
}
