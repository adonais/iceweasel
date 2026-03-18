/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

function triggerClickOn(target, options) {
  if (AppConstants.platform == "macosx") {
    options = { metaKey: options.ctrlKey, shiftKey: options.shiftKey };
  }
  let promise = BrowserTestUtils.waitForEvent(target, "click");
  EventUtils.synthesizeMouseAtCenter(target, options);
  return promise;
}

function getHTMLClipboard() {
  let xferable = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  xferable.init(null);
  xferable.addDataFlavor("text/html");
  Services.clipboard.getData(xferable, Ci.nsIClipboard.kGlobalClipboard);
  let data = {};
  xferable.getTransferData("text/html", data);
  return data.value?.QueryInterface(Ci.nsISupportsString)?.data ?? "";
}
