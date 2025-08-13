/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals exportFunction */

"use strict";

/**
 * e.seb.lt - Recommends Chrome on login page.
 * Bug #1895997 - https://bugzilla.mozilla.org/show_bug.cgi?id=1895997
 * WebCompat issue #136596 - https://webcompat.com/issues/136596
 *
 * We can automatically hide the message for users.
 */

new MutationObserver(mutations => {
  for (let { addedNodes } of mutations) {
    for (const node of addedNodes) {
      try {
        if (
          node.matches(
            ".login__container > .ng-star-inserted > .ng-star-inserted"
          ) &&
          node.innerText.includes("Chrome")
        ) {
          node.remove();
        }
      } catch (_) {}
    }
  }
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
