/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Check that images that don't repeat are written to the PDF as plain image
// XObjects, rather than as tiling patterns.
add_task(async function testImagesAreNotPatterns() {
  await BrowserTestUtils.withNewTab(
    PrintHelper.getTestPageUrl("file_print_images.html"),
    async function (browser) {
      let imageCount = await SpecialPowers.spawn(browser, [], async () => {
        await content.wrappedJSObject.imagesLoaded;
        return content.document.images.length;
      });

      // FIXME(emilio): would be nice to use pdf.js for this, but the relevant
      // APIs (getOperatorList) are compiled out in Firefox.
      // SkPDF doesn't compress object dictionaries, so look at them directly.
      let pdf = new TextDecoder("latin1").decode(
        await PrintHelper.printToPDF(browser)
      );

      let images = pdf.match(/\/Subtype\s*\/Image\b/g) || [];
      is(images.length, imageCount, "Should write every image as an XObject");
      let patterns = pdf.match(/\/PatternType\s*1\b/g) || [];
      is(patterns.length, 0, "Shouldn't write images as tiling patterns");
    }
  );
});
