/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Post-processes generated CSS to match the stylelint rules enforced on SCSS
 * files in browser/extensions/newtab:
 *  - Shorten #RRGGBB hex to #RGB where all pairs match (color-hex-length: short)
 *  - Convert decimal alpha values to percentages (alpha-value-notation: percentage)
 *  - Add blank line before /* block comments that immediately follow a declaration
 *    (comment-empty-line-before: always)
 *
 * @param {string} css - The input CSS being processed.
 * @returns {string}
 */
export const postProcessNovaNewtab = css => {
  return css
    .replace(/#[0-9A-Fa-f]{3,6}\b/g, hex => hex.toUpperCase())
    .replace(/#FFFFFF/g, "#FFF")
    .replace(/,\s*0\.(\d+)\)/g, (_, dec) => {
      let pct = dec.length === 1 ? dec + "0" : String(parseInt(dec, 10));
      return `, ${pct}%)`;
    })
    .replace(/([^\n])\n( +\/\* (?!\*))/g, "$1\n\n$2");
};
