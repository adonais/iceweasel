/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const TEST_PATH = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
);
const TEST_IMG_PATH = TEST_PATH + "file_image_header.sjs?image";

add_task(async function test_img() {
  await BrowserTestUtils.withNewTab({ gBrowser }, async function (browser) {
    browser.loadURI(Services.io.newURI(TEST_IMG_PATH), {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      forceMediaDocument: "image",
    });

    await BrowserTestUtils.browserLoaded(browser, false, TEST_IMG_PATH);

    await SpecialPowers.spawn(browser, [], () => {
      // The image was successfully displayed inline, which means
      // we sent the right Accept header and ignored the Content-Disposition.
      let img = content.document.querySelector("img");
      is(img.width, 1);
      is(img.height, 1);
    });
  });
});
