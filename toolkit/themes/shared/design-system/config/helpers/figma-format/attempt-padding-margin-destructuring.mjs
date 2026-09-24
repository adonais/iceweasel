/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { filterBase } from "./filters.mjs";

export const attemptPaddingMarginDestructuring = (token, originalVal) => {
  if (
    typeof originalVal !== "string" ||
    originalVal.startsWith("calc(") ||
    (!token.path.includes("padding") && !token.path.includes("margin")) ||
    token.path.includes("@base")
  ) {
    return undefined;
  }
  const parts = originalVal.split(/(?<!\([^\s]*)\s+/);

  // return undefined if only 1 part
  if (parts.length === 1) {
    return undefined;
  }
  // throw if more than 4
  if (parts.length > 4) {
    throw new Error(
      `[attemptPaddingMarginDestructuring] Too many parts in ${originalVal}`
    );
  }

  // if 2 parts make object with block and inline keys
  // if 3 parts with block-start, inline and block-end keys
  // if 4 parts with block-start, inline-start, block-end and inline-end keys
  const result = {};
  if (parts.length === 2) {
    result.block = parts[0];
    result.inline = parts[1];
  } else if (parts.length === 3) {
    result.blockStart = parts[0];
    result.inline = parts[1];
    result.blockEnd = parts[2];
  } else if (parts.length === 4) {
    result.blockStart = parts[0];
    result.inlineStart = parts[1];
    result.blockEnd = parts[2];
    result.inlineEnd = parts[3];
  }

  return Object.entries(result).map(([key, value]) => {
    const copy = {
      ...token,
      path: [...token.path, key].filter(filterBase),
      name: [...token.path, key].filter(filterBase).join("/"),
      value,
      original: { ...token.original, value },
    };
    return { token: copy, originalVal: value };
  });
};
