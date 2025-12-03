/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

// Testing that there's no breaking exception when destroying
// an iframe early after its creation.

add_task(async function () {
  const { tab, toolbox } = await openInspectorForURL("about:blank");
  const browser = tab.linkedBrowser;

  // Create/remove an extra one now, after the load event.
  for (let i = 0; i < 10; i++) {
    await SpecialPowers.spawn(browser, [], async function () {
      const iframe = content.document.createElement("iframe");
      content.document.body.appendChild(iframe);
      await new Promise(res => (iframe.onload = res));
      iframe.remove();
    });
  }

  // Wait for requests to settle to avoid unhandled promise rejections
  await toolbox.commands.waitForRequestsToSettle();
});
