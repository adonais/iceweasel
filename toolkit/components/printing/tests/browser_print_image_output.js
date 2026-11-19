/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Print file_print_images.html to PDF.
 *
 * @returns {Promise<{imageCount: number, pdf: string}>} the number of images
 *   in the page, and the contents of the PDF as a latin1 string.
 */
async function printImagesToPDF() {
  let result;
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
      result = { imageCount, pdf };
    }
  );
  return result;
}

// Check that images that don't repeat are written to the PDF as plain image
// XObjects, rather than as tiling patterns.
add_task(async function testImagesAreNotPatterns() {
  let { imageCount, pdf } = await printImagesToPDF();
  let images = pdf.match(/\/Subtype\s*\/Image\b/g) || [];
  is(images.length, imageCount, "Should write every image as an XObject");
  let patterns = pdf.match(/\/PatternType\s*1\b/g) || [];
  is(patterns.length, 0, "Shouldn't write images as tiling patterns");
});

/**
 * Print file_print_images.html to PDF with the given image encoding quality.
 *
 * @param {number} quality - the value of print.skpdf.image-encoding-quality.
 * @returns {Promise<number>} the size of the PDF in bytes.
 */
async function printImagesWithQuality(quality) {
  await SpecialPowers.pushPrefEnv({
    set: [["print.skpdf.image-encoding-quality", quality]],
  });
  let { pdf } = await printImagesToPDF();
  await SpecialPowers.popPrefEnv();
  return pdf.length;
}

// Check that lowering the image encoding quality makes the PDF smaller.
add_task(async function testLossyImageEncoding() {
  let size90 = await printImagesWithQuality(90);
  let size80 = await printImagesWithQuality(80);
  Assert.less(size80, size90, "Lower quality should produce a smaller PDF");
});
