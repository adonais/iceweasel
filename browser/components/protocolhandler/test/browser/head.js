/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

function pageURL(origin, page) {
  return (
    getRootDirectory(gTestPath).replace("chrome://mochitests/content", origin) +
    page
  );
}

async function addIframe(browser, src) {
  await SpecialPowers.spawn(browser, [src], async url => {
    let iframe = content.document.createElement("iframe");
    let loaded = ContentTaskUtils.waitForEvent(iframe, "load");
    iframe.src = url;
    content.document.body.appendChild(iframe);
    await loaded;
  });
}
