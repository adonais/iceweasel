/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import jsdoc from "eslint-plugin-jsdoc";

export default {
  name: "mozilla/valid-jsdoc",
  plugins: { jsdoc },

  rules: {
    "jsdoc/check-access": "error",
    // Handled by prettier
    // "jsdoc/check-alignment": "error",
    "jsdoc/check-param-names": "error",
    "jsdoc/check-property-names": "error",
    "jsdoc/check-tag-names": "error",
    "jsdoc/check-types": "error",
    "jsdoc/empty-tags": "error",
    "jsdoc/multiline-blocks": "error",
    "jsdoc/no-bad-blocks": "error",
    "jsdoc/no-multi-asterisks": ["error", { allowWhitespace: true }],
    // "jsdoc/reject-function-type": "error",
    "jsdoc/require-param-type": "error",
    "jsdoc/require-returns-type": "error",
    "jsdoc/tag-lines": ["error", "any", { startLines: 1 }],
    "jsdoc/valid-types": "error",
  },
};
