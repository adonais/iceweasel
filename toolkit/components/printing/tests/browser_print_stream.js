//creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const PSSVC = Cc["@mozilla.org/gfx/printsettings-service;1"].getService(
  Ci.nsIPrintSettingsService
);

function createPrintSettings(aDestination) {
  let settings = PSSVC.createNewPrintSettings();
  settings.outputFormat = Ci.nsIPrintSettings.kOutputFormatPDF;
  settings.outputDestination = aDestination;

  settings.headerStrCenter = "";
  settings.headerStrLeft = "";
  settings.headerStrRight = "";
  settings.footerStrCenter = "";
  settings.footerStrLeft = "";
  settings.footerStrRight = "";

  settings.unwriteableMarginTop = 1; /* Just to ensure settings are respected on both */
  return settings;
}

async function printToDestination(aBrowser, aDestination) {
  let tmpDir = Services.dirsvc.get("TmpD", Ci.nsIFile);
  let fileName = `printDestinationTest-${aDestination}.pdf`;
  let filePath = PathUtils.join(tmpDir.path, fileName);

  info(`Printing to ${filePath}`);

  let settings = createPrintSettings(aDestination);
  let outStream = null;
  if (aDestination == Ci.nsIPrintSettings.kOutputDestinationFile) {
    settings.toFileName = PathUtils.join(tmpDir.path, fileName);
  } else {
    is(aDestination, Ci.nsIPrintSettings.kOutputDestinationStream);
    outStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(
      Ci.nsIFileOutputStream
    );
    let tmpFile = tmpDir.clone();
    tmpFile.append(fileName);
    outStream.init(tmpFile, -1, 0o666, 0);
    settings.outputStream = outStream;
  }

  await aBrowser.browsingContext.print(settings);

  return filePath;
}

add_task(async function testPrintToStream() {
  await PrintHelper.withTestPage(async helper => {
    let filePath = await printToDestination(
      helper.sourceBrowser,
      Ci.nsIPrintSettings.kOutputDestinationFile
    );
    let streamPath = await printToDestination(
      helper.sourceBrowser,
      Ci.nsIPrintSettings.kOutputDestinationStream
    );

    // In Cocoa the CGContext adds a hash, plus there are other minor
    // non-user-visible differences, so we need to be a bit more sloppy there.
    //
    // We see one byte difference in Windows and Linux on automation sometimes,
    // though files are consistently the same locally, that needs
    // investigation, but it's probably harmless.
    const maxSizeDifference = AppConstants.platform == "macosx" ? 100 : 2;

    // Buffering shenanigans? Wait for sizes to match... There's no great
    // IOUtils methods to force a flush without writing anything...
    await TestUtils.waitForCondition(async function () {
      let fileStat = await IOUtils.stat(filePath);
      let streamStat = await IOUtils.stat(streamPath);

      Assert.greater(
        fileStat.size,
        0,
        "File file should not be empty: " + fileStat.size
      );
      Assert.greater(
        streamStat.size,
        0,
        "Stream file should not be empty: " + streamStat.size
      );
      return Math.abs(fileStat.size - streamStat.size) <= maxSizeDifference;
    }, "Sizes should (almost) match");

    if (false) {
      // This doesn't work reliably on automation, but works locally, see
      // above...
      let fileData = await IOUtils.read(filePath);
      let streamData = await IOUtils.read(streamPath);
      ok(!!fileData.length, "File should not be empty");
      is(fileData.length, streamData.length, "File size should be equal");
      for (let i = 0; i < fileData.length; ++i) {
        if (fileData[i] != streamData[i]) {
          is(
            fileData[i],
            streamData[i],
            `Files should be equal (byte ${i} different)`
          );
          break;
        }
      }
    }

    await IOUtils.remove(filePath);
    await IOUtils.remove(streamPath);
  });
});

add_task(async function testPrintToAtomicStream() {
  await PrintHelper.withTestPage(async helper => {
    let tmpDir = Services.dirsvc.get("TmpD", Ci.nsIFile);
    let destFile = tmpDir.clone();
    destFile.append("printDestinationTest-atomic.pdf");
    let tempFile = tmpDir.clone();
    tempFile.append("printDestinationTest-atomic-1.pdf");

    const oldContents = "not a pdf";
    await IOUtils.writeUTF8(destFile.path, oldContents);

    let outStream = Cc[
      "@mozilla.org/network/atomic-file-output-stream;1"
    ].createInstance(Ci.nsIFileOutputStream);
    outStream.init(destFile, -1, 0o666, 0);
    ok(
      outStream instanceof Ci.nsISafeOutputStream,
      "Should be a safe output stream"
    );

    let settings = createPrintSettings(
      Ci.nsIPrintSettings.kOutputDestinationStream
    );
    settings.outputStream = outStream;

    ok(tempFile.exists(), "Should write to a temporary file while printing");
    is(
      await IOUtils.readUTF8(destFile.path),
      oldContents,
      "Destination should be untouched before printing"
    );

    await helper.sourceBrowser.browsingContext.print(settings);

    let header = await IOUtils.read(destFile.path, { maxBytes: 5 });
    is(
      new TextDecoder().decode(header),
      "%PDF-",
      "Destination should have been replaced with the PDF"
    );
    ok(!tempFile.exists(), "Temporary file should have been moved into place");

    await IOUtils.remove(destFile.path);
  });
});
