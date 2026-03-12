/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXAMPLE_PARENT_ROOT = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.net"
);
const EXAMPLE_FRAME_ROOT = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.org"
);

const FRAMEBUSTING_PARENT_URL =
  EXAMPLE_PARENT_ROOT + "framebusting_intervention_parent.html";
const FRAMEBUSTING_FRAME_URL =
  EXAMPLE_FRAME_ROOT + "framebusting_intervention_frame.html";

async function triggerFramebustingIntervention(
  tab,
  query = "",
  verify = { exception: undefined, notification: undefined }
) {
  info("Loading framebusting parent page...");
  BrowserTestUtils.startLoadingURIString(
    tab.linkedBrowser,
    FRAMEBUSTING_PARENT_URL
  );
  await BrowserTestUtils.browserLoaded(
    tab.linkedBrowser,
    /*includeSubFrames=*/ false,
    FRAMEBUSTING_PARENT_URL
  );

  const frameSrc = FRAMEBUSTING_FRAME_URL + query;

  info("Loading framebusting frame page...");
  await SpecialPowers.spawn(
    tab.linkedBrowser,
    [frameSrc, verify.exception],
    async (src, verifyException) => {
      function waitForVerifyExceptionMessage() {
        return new Promise(resolve => {
          content.window.addEventListener(
            "message",
            event => {
              is(event.origin, "https://example.org");
              is(
                event.data,
                verifyException ? "exception" : "no-exception",
                `Should ${verifyException ? "" : "not "}receive an exception when trying to framebust (${src})`
              );
              resolve();
            },
            { once: true }
          );
        });
      }

      const verifyExceptionPromise =
        verifyException !== undefined
          ? waitForVerifyExceptionMessage()
          : Promise.resolve();

      const iframe = content.document.createElement("iframe");
      iframe.id = "framebustingframe";
      iframe.src = src;
      content.document.body.appendChild(iframe);

      await verifyExceptionPromise;
    }
  );

  if (verify.notification) {
    await BrowserTestUtils.waitForCondition(() =>
      gBrowser.getNotificationBox().getNotificationWithValue("popup-blocked")
    );
    ok(true, `Framebusting notification should show up (${frameSrc})`);
  }
}
