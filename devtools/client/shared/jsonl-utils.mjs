/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { parseJsonLossless } from "resource://devtools/client/shared/components/reps/reps/rep-utils.mjs";

// Brands JsonlLineError instances so they can be recognized across module
// instances, where `instanceof` would fail.
const JSONL_LINE_ERROR = Symbol.for("devtools.jsonl.lineError");

/**
 * Represents one line of a JSON Lines document that failed to parse
 * as JSON. `raw` and `message` are non-enumerable so this behaves as
 * a leaf node in the JSON tree view (no expand toggle, no children).
 */
export class JsonlLineError {
  /**
   * @param {string} raw
   *        The line's original text.
   * @param {string} message
   *        The parse error message reported for that line.
   */
  constructor(raw, message) {
    Object.defineProperties(this, {
      raw: { value: raw, enumerable: false },
      message: { value: message, enumerable: false },
      [JSONL_LINE_ERROR]: { value: true, enumerable: false },
    });
  }

  static isInstance(value) {
    return !!value?.[JSONL_LINE_ERROR];
  }

  toJSON() {
    return { error: this.message, raw: this.raw };
  }
}

/**
 * Parses a JSON Lines document (one JSON value per line) into an
 * array of records, in document order. Blank lines are skipped, so
 * the array is contiguous and displayed like any other JSON array.
 * A line that fails to parse becomes a JsonlLineError instead of
 * blocking the rest of the document.
 *
 * @param {string} jsonlinesText
 *        The whole JSON Lines document, as text.
 * @returns {Array<object|JsonlLineError>}
 *        One entry per non-blank line, in document order.
 */
export function parseJsonl(jsonlinesText) {
  const entries = [];
  const lines = jsonlinesText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      continue;
    }
    try {
      entries.push(parseJsonLossless(line));
    } catch (err) {
      entries.push(
        new JsonlLineError(line, documentLineErrorMessage(err, line, i))
      );
    }
  }
  return entries;
}

/**
 * Returns the parse error message for a line which failed to parse, pointing at
 * the line's position in the document. The line is reparsed preceded by the
 * blank lines it comes after, since a parser fed a single line can only ever
 * report line 1.
 *
 * @param {Error} err
 *        The error thrown when parsing the line on its own.
 * @param {string} line
 *        The line's text.
 * @param {number} lineIndex
 *        The 0-based position of the line in the document.
 * @returns {string}
 *        The parse error message.
 */
function documentLineErrorMessage(err, line, lineIndex) {
  if (!lineIndex) {
    return err.message;
  }
  try {
    parseJsonLossless("\n".repeat(lineIndex) + line);
  } catch (paddedErr) {
    return paddedErr.message;
  }
  return err.message;
}
