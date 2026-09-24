/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Bug 1638383 - Microsoft login iframes missing a sandbox attribute
 *
 * Microsoft's authentication iframes are sandboxed without
 * allow-storage-access-by-user-activation, which means they cannot request
 * first-party storage access and login fails under dFPI. This shim watches for
 * those iframes being added and adds the missing attribute.
 */

const SANDBOX_ATTR = "allow-storage-access-by-user-activation";

console.warn(
  "Firefox calls the Storage Access API on behalf of the site. See https://bugzilla.mozilla.org/show_bug.cgi?id=1638383 for details."
);

// Watches for MS auth iframes and adds missing sandbox attribute. The attribute
// is required so the third-party iframe can gain access to its first party
// storage via the Storage Access API.
function init() {
  const observer = new MutationObserver(() => {
    document.body
      .querySelectorAll(
        `iframe:is([id^='msalRenewFrame'], [src^="https://login.microsoftonline.com"])[sandbox]`
      )
      .forEach(frame => {
        frame.sandbox.add(SANDBOX_ATTR);
      });
  });

  observer.observe(document.body, {
    attributes: true,
    subtree: false,
    childList: true,
  });
}
window.addEventListener("DOMContentLoaded", init);
