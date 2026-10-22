/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Removing one of two HTTP activity observers must keep activity flowing to
// the other (bug 2078514).

"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

let httpServer;

add_setup(function () {
  httpServer = new HttpServer();
  httpServer.registerPathHandler("/", (request, response) => {
    response.write("ok");
  });
  httpServer.start(-1);

  registerCleanupFunction(async () => {
    await httpServer.stop();
  });
});

function makeObserver(url) {
  return {
    sawTransactionClose: false,
    observeActivity(aChannel, aType, aSubtype) {
      if (
        aChannel instanceof Ci.nsIChannel &&
        aChannel.URI.spec == url &&
        aType == Ci.nsIHttpActivityObserver.ACTIVITY_TYPE_HTTP_TRANSACTION &&
        aSubtype ==
          Ci.nsIHttpActivityObserver.ACTIVITY_SUBTYPE_TRANSACTION_CLOSE
      ) {
        this.sawTransactionClose = true;
      }
    },
  };
}

add_task(async function test_remaining_observer_still_notified() {
  let url = `http://localhost:${httpServer.identity.primaryPort}/`;
  let distributor = Cc[
    "@mozilla.org/network/http-activity-distributor;1"
  ].getService(Ci.nsIHttpActivityDistributor);

  let kept = makeObserver(url);
  let removed = makeObserver(url);
  distributor.addObserver(kept);
  distributor.addObserver(removed);
  distributor.removeObserver(removed);

  // Without keep-alive the channel skips its speculative connect, whose null
  // transaction reads nsIHttpActivityDistributor.isActive. That read recomputes
  // the cached flag and would hide the bug.
  let chan = makeChan(url);
  chan.setRequestHeader("Connection", "close", false);
  await channelOpenPromise(chan);

  await TestUtils.waitForCondition(
    () => kept.sawTransactionClose,
    "remaining observer gets the transaction-close activity"
  );
  Assert.ok(!removed.sawTransactionClose, "removed observer is not notified");

  distributor.removeObserver(kept);
});
