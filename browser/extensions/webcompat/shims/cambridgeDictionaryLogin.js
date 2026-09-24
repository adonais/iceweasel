/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Bug 1993727 - Cambridge Dictionary Google login
 *
 * Logging in or registering goes through Gigya at accounts.eu1.gigya.com,
 * which needs its own first-party storage to complete the flow. Under dFPI
 * that access is partitioned away. This shim intercepts clicks on the login
 * and register buttons and calls the Storage Access API on the site's behalf
 * first.
 */

"use strict";

console.warn(
  `When logging in, Firefox calls the Storage Access API on behalf of the site. See https://bugzilla.mozilla.org/show_bug.cgi?id=1993727 for details.`
);

// Third-party origin we need to request storage access for.
const STORAGE_ACCESS_ORIGIN = "https://accounts.eu1.gigya.com";

document.documentElement.addEventListener(
  "click",
  e => {
    const { target, isTrusted } = e;
    if (!isTrusted) {
      return;
    }
    const loginElement = target.closest(
      "span.cdo-login-button, span.cdo-register-button"
    );
    if (!loginElement) {
      return;
    }

    console.warn(
      "Calling the Storage Access API on behalf of " + STORAGE_ACCESS_ORIGIN
    );
    e.stopPropagation();
    e.preventDefault();
    document.requestStorageAccessForOrigin(STORAGE_ACCESS_ORIGIN).then(() => {
      target.click();
    });
  },
  true
);
