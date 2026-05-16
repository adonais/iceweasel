/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  EventDispatcher: "resource://gre/modules/Messaging.sys.mjs",
  IPProtectionService:
    "moz-src:///toolkit/components/ipprotection/IPProtectionService.sys.mjs",
});

/**
 * Android implementation of the enrollment step for IPPEnrollAndEntitleManager.
 *
 * Delegates the hidden OAuth window to the Android layer via EventDispatcher.
 * The Android layer must open the loginUrl in a Custom Tab or WebView, monitor
 * for a redirect to successUrl or errorUrl, and resolve or reject accordingly.
 *
 * Expected response on success: { ok: true }
 * Expected response on failure: rejection with an error message.
 *
 * @param {AbortSignal} [abortSignal=null]
 * @returns {Promise<{enrollment: boolean}|{enrollment: null, error: string}>}
 */
export async function androidEnroll(abortSignal = null) {
  try {
    abortSignal?.throwIfAborted();
    const { loginURL, successURL, errorURL } =
      lazy.IPProtectionService.guardian.enrollmentURLs();

    let tasks = [
      lazy.EventDispatcher.instance.sendRequestForResult(
        "IPP:StartEnrollment",
        {
          loginUrl: loginURL.href,
          successUrl: successURL.href,
          errorUrl: errorURL.href,
        }
      ),
    ];
    if (abortSignal) {
      tasks.push(
        new Promise((_, reject) => {
          abortSignal.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true }
          );
        })
      );
    }

    const result = await Promise.race(tasks);
    if (!result?.ok) {
      return { enrollment: null, error: result?.error ?? "enrollment_failed" };
    }
    return { enrollment: true };
  } catch (error) {
    return { enrollment: null, error: error?.message };
  }
}
