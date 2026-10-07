"use strict";

const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);

// RGBA PNG with opaque, translucent, and transparent pixels.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAG0lEQVR42mP4z8DwHwwZ/gPJ//8bGEACDAwMAJwCCneezjcWAAAAAElFTkSuQmCC";
const PNG_WIDTH = 3;
const PNG_HEIGHT = 2;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function getString(clipboard) {
  var str = "";

  // Create transferable that will transfer the text.
  var trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  trans.init(null);
  trans.addDataFlavor("text/plain");

  clipboard.getData(trans, Ci.nsIClipboard.kGlobalClipboard);

  try {
    var data = {};
    trans.getTransferData("text/plain", data);

    if (data) {
      data = data.value.QueryInterface(Ci.nsISupportsString);
      str = data.data;
    }
  } catch (ex) {
    // If the clipboard is empty getTransferData will throw.
  }

  return str;
}

function getPNG(clipboard) {
  const trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  trans.init(null);
  trans.addDataFlavor("image/png");

  clipboard.getData(trans, Ci.nsIClipboard.kGlobalClipboard);

  const data = {};
  try {
    trans.getTransferData("image/png", data);
  } catch (ex) {
    return null;
  }

  const stream = data.value.QueryInterface(Ci.nsIInputStream);
  return new Uint8Array(NetUtil.readInputStream(stream));
}

function decodePNG(bytes) {
  const imgTools = Cc["@mozilla.org/image/tools;1"].getService(Ci.imgITools);
  return imgTools.decodeImageFromArrayBuffer(bytes.buffer, "image/png");
}

function copyImage(clipboard, image) {
  const trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  trans.init(null);
  trans.addDataFlavor("application/x-moz-nativeimage");
  trans.setTransferData("application/x-moz-nativeimage", image);
  clipboard.setData(trans, null, Ci.nsIClipboard.kGlobalClipboard);
}

add_task(async function test_clipboard() {
  let clipboard = Services.clipboard;

  // Test copy.
  const data = "random number: " + Math.random();
  let helper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
    Ci.nsIClipboardHelper
  );
  helper.copyString(data);
  equal(getString(clipboard), data, "Data was successfully copied.");

  clipboard.emptyClipboard(Ci.nsIClipboard.kGlobalClipboard);
  equal(getString(clipboard), "", "Data was successfully cleared.");
});

add_task(async function test_clipboard_image() {
  const clipboard = Services.clipboard;
  const kGlobal = Ci.nsIClipboard.kGlobalClipboard;

  const image = decodePNG(
    Uint8Array.from(atob(PNG_BASE64), c => c.charCodeAt(0))
  );
  equal(image.width, PNG_WIDTH, "The test image decodes.");

  copyImage(clipboard, image);

  ok(
    clipboard.hasDataMatchingFlavors(["image/png"], kGlobal),
    "The clipboard reports image/png data."
  );
  ok(
    !clipboard.hasDataMatchingFlavors(["text/plain", "text/html"], kGlobal),
    "The clipboard reports no text data."
  );
  deepEqual(
    clipboard.getDataSnapshotSync(["text/plain", "image/png"], kGlobal)
      .flavorList,
    ["image/png"],
    "A snapshot lists image/png only."
  );

  const png = getPNG(clipboard);
  ok(png, "Image data was read back.");
  deepEqual(
    Array.from(png.subarray(0, PNG_SIGNATURE.length)),
    PNG_SIGNATURE,
    "The image data is PNG encoded."
  );
  const decoded = decodePNG(png);
  equal(decoded.width, PNG_WIDTH, "The width is preserved.");
  equal(decoded.height, PNG_HEIGHT, "The height is preserved.");

  deepEqual(
    Array.from(getPNG(clipboard)),
    Array.from(png),
    "The image can be read again."
  );

  const helper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
    Ci.nsIClipboardHelper
  );
  helper.copyString("text");
  equal(getPNG(clipboard), null, "Copying text replaced the image.");
  ok(
    !clipboard.hasDataMatchingFlavors(["image/png"], kGlobal),
    "The clipboard no longer reports image/png data."
  );

  copyImage(clipboard, image);
  ok(getPNG(clipboard), "The image was copied again.");
  equal(getString(clipboard), "", "Copying the image replaced the text.");

  clipboard.emptyClipboard(kGlobal);
  equal(getPNG(clipboard), null, "The image was cleared.");
});
