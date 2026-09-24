/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { basename } from "node:path";

/**
 * Based on the file name, determine which category its tokens belong to (e.g. color.tokens.json => color).
 * This gets applied to the variable names, so references to {color.blue.50} will work.
 *
 * @param {string} filePath - Path to the file being parsed.
 * @returns {string} - Category of tokens belonging to the file being parsed.
 */
const getTokenCategory = filePath => {
  const fileName = basename(filePath);
  const tokenCategory = fileName
    .replace(".tokens.json", "")
    .replace("moz-", "");

  return tokenCategory;
};

/**
 * Modify JSON objects to apply a top-level key representing the token category, based on the file name.
 *
 * @param {object} params
 * @param {string} params.filePath - Path to file being parsed.
 * @param {string} params.contents - Stringified contents of the file being parsed.
 * @returns {object} - JSON object, modified from the original to add a top-level key with the token category name.
 */
export const jsonParser = ({ filePath, contents }) =>
  JSON.parse(`{"${getTokenCategory(filePath)}": ${contents}}`);
