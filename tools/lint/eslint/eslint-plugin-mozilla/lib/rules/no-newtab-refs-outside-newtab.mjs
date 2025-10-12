/**
 * @file Reject use of chrome://newtab or resource://newtab from code
 *       outside of browser/extensions/newtab, browser/components/newtab,
 *       browser/modules/AboutNewTab.sys.mjs, and browser/actors/AboutNewTabChild.sys.mjs.
 *       This prevents coupling with the newtab codebase, which can update out
 *       band from the rest of the browser.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export default {
  meta: {
    docs: {
      url: "https://firefox-source-docs.mozilla.org/code-quality/lint/linters/eslint-plugin-mozilla/rules/no-newtab-refs-outside-newtab.html",
    },
    messages: {
      noNewtabRefs:
        "> {{url}} is part of the newtab codebase and cannot be " +
        "used by code outside of browser/extensions/newtab, browser/components/newtab, " +
        "browser/modules/AboutNewTab.sys.mjs, or browser/actors/AboutNewTabChild.sys.mjs as " +
        "it may update out-of-band from the rest of the browser.",
    },
    schema: [],
    type: "suggestion",
  },

  create(context) {
    const filename = context.getFilename();

    // Hard-code some directories and files that should always be exempt.
    if (
      filename.includes("browser/extensions/newtab/") ||
      filename.includes("browser/components/newtab/") ||
      filename.endsWith("browser/modules/AboutNewTab.sys.mjs") ||
      filename.endsWith("browser/actors/AboutNewTabChild.sys.mjs")
    ) {
      return {};
    }

    return {
      Literal(node) {
        if (typeof node.value != "string") {
          return;
        }
        if (
          node.value.startsWith("chrome://newtab") ||
          node.value.startsWith("resource://newtab")
        ) {
          context.report({
            node,
            messageId: "noNewtabRefs",
            data: { url: node.value },
          });
        }
      },
    };
  },
};
