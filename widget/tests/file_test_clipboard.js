/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/* import-globals-from clipboard_helper.js */

"use strict";

function getLoadContext() {
  return SpecialPowers.wrap(window).docShell.QueryInterface(Ci.nsILoadContext);
}

// Get clipboard data to paste.
function paste(clipboard) {
  let trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  trans.init(getLoadContext());
  trans.addDataFlavor("text/plain");
  clipboard.getData(
    trans,
    Ci.nsIClipboard.kGlobalClipboard,
    SpecialPowers.wrap(window).browsingContext.currentWindowContext
  );
  let str = SpecialPowers.createBlankObject();
  try {
    trans.getTransferData("text/plain", str);
  } catch (e) {
    str = "";
  }
  if (str) {
    str = str.value.QueryInterface(Ci.nsISupportsString);
    if (str) {
      str = str.data;
    }
  }
  return str;
}

let isWayland = false;

add_setup(async function init() {
  isWayland = (await getWindowProtocol()) === "wayland";
  await cleanupAllClipboard();
});

/* Test for bug 948065 */
add_task(async function test_copy() {
  // Test copy.
  const data = "random number: " + Math.random();
  let helper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
    Ci.nsIClipboardHelper
  );
  helper.copyString(data);
  is(paste(clipboard), data, "Data was successfully copied.");

  clipboard.emptyClipboard(Ci.nsIClipboard.kGlobalClipboard);
  // XXX wayland does not support clearing clipboard, see bug 1857075.
  if (!isWayland) {
    is(paste(clipboard), "", "Data was successfully cleared.");
  }

  await cleanupAllClipboard();
});

/* Tests for bug 1834073 */
clipboardTypes.forEach(function (clipboardType) {
  if (clipboard.isClipboardTypeSupported(clipboardType)) {
    add_task(function test_clipboard_apis() {
      info(`Test clipboard apis for type ${clipboardType}`);

      // Set clipboard data
      let str;
      try {
        str = writeRandomStringToClipboard("text/plain", clipboardType);
      } catch (e) {
        ok(
          false,
          `setData should not throw error for clipboard type ${clipboardType}`
        );
      }

      // Test hasDataMatchingFlavors
      try {
        ok(
          clipboard.hasDataMatchingFlavors(["text/plain"], clipboardType),
          `Test hasDataMatchingFlavors for clipboard type ${clipboardType}`
        );
      } catch (e) {
        ok(
          false,
          `hasDataMatchingFlavors should not throw error for clipboard type ${clipboardType}`
        );
      }

      // Test getData
      try {
        is(
          getClipboardData("text/plain", clipboardType),
          str,
          `Test getData for clipboard type ${clipboardType}`
        );
      } catch (e) {
        ok(
          false,
          `getData should not throw error for clipboard type ${clipboardType}`
        );
      }
    });

    add_task(async function test_clipboard_set_empty_string() {
      info(`Test setting empty string to type ${clipboardType}`);

      // Clear clipboard type.
      clipboard.emptyClipboard(clipboardType);
      // XXX wayland does not support clearing clipboard, see bug 1857075.
      if (!isWayland) {
        is(
          getClipboardData("text/plain", clipboardType),
          null,
          `Should get null data on clipboard type ${clipboardType}`
        );
        ok(
          !clipboard.hasDataMatchingFlavors(["text/plain"], clipboardType),
          `Should not have text/plain flavor on clipboard ${clipboardType}`
        );
      }

      // Set text/plain to empty string.
      writeStringToClipboard("", "text/plain", clipboardType);
      // XXX gtk doesn't support get empty text data from clipboard, bug 1852983.
      if (navigator.platform.includes("Linux")) {
        todo_is(
          getClipboardData("text/plain", clipboardType),
          "",
          `Should get empty string on clipboard type ${clipboardType}`
        );
      } else {
        is(
          getClipboardData("text/plain", clipboardType),
          "",
          `Should get empty string on clipboard type ${clipboardType}`
        );
      }
      // XXX android doesn't support setting empty text data to clipboard, bug 1841058.
      if (navigator.userAgent.includes("Android")) {
        todo_is(
          clipboard.hasDataMatchingFlavors(["text/plain"], clipboardType),
          true,
          `Should have text/plain flavor on clipboard ${clipboardType}`
        );
      } else {
        ok(
          clipboard.hasDataMatchingFlavors(["text/plain"], clipboardType),
          `Should have text/plain flavor on clipboard ${clipboardType}`
        );
      }

      // Clear all clipboard data.
      await cleanupAllClipboard();
    });

    add_task(function test_unsupport_flavor() {
      try {
        is(
          getClipboardData("foo/bar", clipboardType),
          null,
          `Test getData for clipboard type ${clipboardType}`
        );
      } catch (e) {
        ok(
          false,
          `getData should not throw error for clipboard type ${clipboardType}`
        );
      }
    });

    add_task(function test_web_custom_format() {
      // Web custom format clipboard support is not yet implemented on Android.
      if (navigator.userAgent.includes("Android")) {
        info("Skipping: Android does not yet support web custom formats");
        return;
      }
      let inputFormats = [
        "text/plain",
        "web text/plain",
        "web application/abc",
      ];
      let expectedResults = writeMultipleDataToClipboard(
        inputFormats,
        clipboardType
      );

      inputFormats.forEach(format => {
        is(
          getClipboardData(format, clipboardType),
          expectedResults.get(format),
          `The data for ${format} saved in clipboard should be matched.`
        );
      });
    });

    add_task(function test_unsupported_format() {
      const unsupportedFormats = [
        "application/abc",
        "text/plain;foo=1",
        "web foo/bar;foo=1",
      ];
      let runOnParentProcess = false;
      if (
        SpecialPowers.Services.appinfo.processType ===
        Ci.nsIXULRuntime.PROCESS_TYPE_DEFAULT
      ) {
        runOnParentProcess = true;
      }
      let expectedResults = writeMultipleDataToClipboard(
        unsupportedFormats,
        clipboardType
      );

      // Valid mimeType are supported in the parent process, but not content
      // process, because the valid but non-supported mimeType, such as
      // application/abc is not allowed to be transferred through IPC.
      unsupportedFormats.forEach(format => {
        if (format === "web foo/bar;foo=1") {
          ok(
            !clipboard.hasDataMatchingFlavors([format], clipboardType),
            `${format} should not be saved in clipboard.`
          );
          is(
            getClipboardData(format, clipboardType),
            null,
            `${format} data should not be saved in clipboard.`
          );
        } else if (runOnParentProcess) {
          ok(
            clipboard.hasDataMatchingFlavors([format], clipboardType),
            `${format} should be saved in clipboard.`
          );
          is(
            getClipboardData(format, clipboardType),
            expectedResults.get(format),
            `${format} data should be saved in clipboard.`
          );
        } else {
          ok(
            !clipboard.hasDataMatchingFlavors([format], clipboardType),
            `${format} should not be saved in clipboard.`
          );
          is(
            getClipboardData(format, clipboardType),
            null,
            `${format} data should not be saved in clipboard.`
          );
        }
      });
    });

    add_task(function test_web_custom_format_map() {
      const inputFormats = [
        "text/plain",
        "web text/plain",
        "web application/abc",
      ];
      let expectedResults = writeMultipleDataToClipboard(
        inputFormats,
        clipboardType
      );
      // Web custom format map checking can only be done in the parent process.
      // The type string, application/x-moz-web-custom-format-map, for web
      // custom format map is not allowed to transfer by nsITransferable through
      // IPC.
      // It is only allowed to use application/x-moz-web-custom-format-map when
      // nsIClipboard::getDataSnaphot(Sync) for getting all web custom formats.
      // see file_test_clipboard_getDataSnapshot(Sync).js
      if (
        SpecialPowers.Services.appinfo.processType ===
        Ci.nsIXULRuntime.PROCESS_TYPE_DEFAULT
      ) {
        let customFormats = getClipboardData(
          "application/x-moz-web-custom-format-map",
          clipboardType
        );
        is(
          customFormats.length,
          2,
          "Should have two custom formats in the clipboard"
        );

        inputFormats.forEach(format => {
          let isCustomFormat = false;
          if (format.startsWith("web ")) {
            isCustomFormat = true;
          }
          let foundInCustomFormatMap = false;
          for (let customFormat of customFormats.enumerate(
            SpecialPowers.Ci.nsISupportsCString
          )) {
            if (customFormat.data === format) {
              foundInCustomFormatMap = true;
              break;
            }
          }
          is(
            isCustomFormat,
            foundInCustomFormatMap,
            `Check whether ${format} is in custom format map.`
          );
          is(
            getClipboardData(format, clipboardType),
            expectedResults.get(format),
            `The data for ${format} saved in clipboard should be matched.`
          );
        });
      } else {
        let result = Cr.NS_OK;
        try {
          is(
            getClipboardData("application/x-moz-web-custom-format-map"),
            null,
            "Should not get web custom format map in content process."
          );
        } catch (e) {
          result = e.result;
        } finally {
          is(
            result,
            Cr.NS_ERROR_FAILURE,
            "Get web custom format map in content process should throw."
          );
        }
      }
    });
  }
});

// Verify that web custom formats Firefox wrote are always readable through
// the system-clipboard path regardless of
// clipboard.readCustomFormatsFromClipboard.enabled. The pref only gates web
// custom flavors written by other applications, and the gate detects "our
// own write" via the clipboard cache's sequence number (which is populated
// independently of widget.clipboard.use-cached-data.enabled). The in-process
// cache is disabled here so reads exercise the system-clipboard path.
// HeadlessClipboard doesn't support web custom formats, so this test
// requires a real platform pasteboard.
add_task(async function test_read_custom_formats_from_clipboard_pref() {
  if (SpecialPowers.isHeadless) {
    info("Skipping: HeadlessClipboard does not support web custom formats");
    return;
  }
  // Web custom format clipboard support is not yet implemented on Android.
  if (navigator.userAgent.includes("Android")) {
    info("Skipping: Android does not yet support web custom formats");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [["widget.clipboard.use-cached-data.enabled", false]],
  });

  let inputFormats = ["web text/plain"];
  writeMultipleDataToClipboard(inputFormats, clipboard.kGlobalClipboard);

  for (let prefValue of [true, false]) {
    await SpecialPowers.pushPrefEnv({
      set: [["clipboard.readCustomFormatsFromClipboard.enabled", prefValue]],
    });
    let request = clipboard.getDataSnapshotSync(
      ["application/x-moz-web-custom-format-map"],
      clipboard.kGlobalClipboard
    );
    ok(
      request.flavorList.includes("web text/plain"),
      `Own web custom format should be exposed when pref is ${prefValue}`
    );
    await SpecialPowers.popPrefEnv();
  }

  await SpecialPowers.popPrefEnv();
});

// Verify that an empty "web foo/bar" payload survives a system-pasteboard
// round-trip. Platform pasteboards (notably macOS's setData:/dataForType:)
// could plausibly drop a zero-length entry; this test locks in the round-trip
// so any future regression is caught. The in-process cache is disabled with
// widget.clipboard.use-cached-data.enabled = false so the read exercises the
// system-clipboard path rather than returning the cached transferable.
// HeadlessClipboard doesn't support web custom formats, so this test requires
// a real platform pasteboard.
add_task(async function test_web_custom_format_empty_payload() {
  if (SpecialPowers.isHeadless) {
    info("Skipping: HeadlessClipboard does not support web custom formats");
    return;
  }
  // Web custom format clipboard support is not yet implemented on Android.
  if (navigator.userAgent.includes("Android")) {
    info("Skipping: Android does not yet support web custom formats");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [["widget.clipboard.use-cached-data.enabled", false]],
  });

  const flavor = "web text/plain";

  // Write the empty payload as an nsISupportsCString, matching how web
  // custom format bytes are represented in the DOM bindings.
  let trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  trans.init(null);
  trans.addDataFlavor(flavor);
  let supports = Cc["@mozilla.org/supports-cstring;1"].createInstance(
    Ci.nsISupportsCString
  );
  supports.data = "";
  trans.setTransferData(flavor, supports);
  clipboard.setData(trans, null, clipboard.kGlobalClipboard);

  // XXX gtk doesn't preserve empty data through the clipboard, bug 1852983.
  if (navigator.platform.includes("Linux")) {
    todo_is(
      getClipboardData(flavor, clipboard.kGlobalClipboard),
      "",
      "Empty web custom format payload should round-trip through the system pasteboard"
    );
  } else {
    is(
      getClipboardData(flavor, clipboard.kGlobalClipboard),
      "",
      "Empty web custom format payload should round-trip through the system pasteboard"
    );
  }

  await cleanupAllClipboard();
  await SpecialPowers.popPrefEnv();
});
