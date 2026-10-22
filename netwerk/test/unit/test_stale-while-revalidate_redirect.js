/*

Tests that the stale-while-revalidate background revalidation channel doesn't
interact with the channel that triggered it (bug 2071998): its redirect and
progress notifications must not reach the original notification callbacks, it
must not be added to the original load group and must not share its loadInfo.

* Make request #1.
  - response is 200 from the server, max-age=1, stale-while-revalidate=9999
* Make the server respond with a 302 from now on.
* Make request #2 in 2 seconds with observing callbacks and load group.
  - response is from the cache
  - the background revalidation gets the 302
* Wait for "http-on-background-revalidation".
  - the callbacks and load group of request #2 didn't see the background channel
* Make request #3.
  - the revalidated 302 is served from the cache and redirects to /target

*/

"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

let redirect = false;
const ORIGINAL_BODY = "original";
const TARGET_BODY = "target";
const REDIRECT_BODY = "redirect";

function test_handler(metadata, response) {
  if (redirect) {
    response.setStatusLine(metadata.httpVersion, 302, "Found");
    response.setHeader("Location", "/target", false);
    response.setHeader("Cache-control", "max-age=100", false);
    response.bodyOutputStream.write(REDIRECT_BODY, REDIRECT_BODY.length);
    return;
  }
  response.setHeader("Content-Type", "text/plain", false);
  response.setHeader(
    "Cache-control",
    "max-age=1, stale-while-revalidate=9999",
    false
  );
  response.setStatusLine(metadata.httpVersion, 200, "OK");
  response.bodyOutputStream.write(ORIGINAL_BODY, ORIGINAL_BODY.length);
}

function target_handler(metadata, response) {
  response.setHeader("Content-Type", "text/plain", false);
  response.setHeader("Cache-control", "no-store", false);
  response.setStatusLine(metadata.httpVersion, 200, "OK");
  response.bodyOutputStream.write(TARGET_BODY, TARGET_BODY.length);
}

// Records the notifications that are not about the foreground channel.
class ForeignNotifications {
  foreground = null;
  redirects = 0;
  progress = 0;

  QueryInterface = ChromeUtils.generateQI([
    "nsIInterfaceRequestor",
    "nsIChannelEventSink",
    "nsIProgressEventSink",
  ]);

  getInterface(iid) {
    return this.QueryInterface(iid);
  }

  asyncOnChannelRedirect(oldChannel, newChannel, flags, callback) {
    this.redirects++;
    callback.onRedirectVerifyCallback(Cr.NS_OK);
  }

  onProgress(request) {
    if (request != this.foreground) {
      this.progress++;
    }
  }

  onStatus(request) {
    if (request != this.foreground) {
      this.progress++;
    }
  }
}

function make_channel(url) {
  return NetUtil.newChannel({
    uri: url,
    loadUsingSystemPrincipal: true,
  }).QueryInterface(Ci.nsIHttpChannel);
}

function get_response(channel, fromCache) {
  return new Promise(resolve => {
    channel.asyncOpen(
      new ChannelListener((request, buffer, ctx, isFromCache) => {
        Assert.equal(
          fromCache,
          isFromCache,
          `got response from cache = ${fromCache}`
        );
        resolve(buffer);
      })
    );
  });
}

function sleep(time) {
  return new Promise(resolve => {
    do_timeout(time * 1000, resolve);
  });
}

function background_reval_promise() {
  return new Promise(resolve => {
    Services.obs.addObserver(function observer(subject) {
      Services.obs.removeObserver(observer, "http-on-background-revalidation");
      resolve(subject.QueryInterface(Ci.nsIChannel));
    }, "http-on-background-revalidation");
  });
}

add_task(async function test_background_revalidation_is_isolated() {
  let httpserver = new HttpServer();
  httpserver.registerPathHandler("/testdir", test_handler);
  httpserver.registerPathHandler("/target", target_handler);
  httpserver.start(-1);
  registerCleanupFunction(() => httpserver.stop());
  const URI = `http://localhost:${httpserver.identity.primaryPort}/testdir`;

  let response = await get_response(make_channel(URI), false);
  Assert.equal(response, ORIGINAL_BODY, "got original response");
  await sleep(2);

  let reval_done = background_reval_promise();
  redirect = true;

  let observer = new ForeignNotifications();
  let loadGroup = Cc["@mozilla.org/network/load-group;1"].createInstance(
    Ci.nsILoadGroup
  );
  let channel = make_channel(URI);
  channel.notificationCallbacks = observer;
  channel.loadGroup = loadGroup;
  observer.foreground = channel;

  response = await get_response(channel, true);
  Assert.equal(response, ORIGINAL_BODY, "got stale response from the cache");

  let backgroundChannel = await reval_done;
  Assert.equal(
    observer.redirects,
    0,
    "background revalidation redirect was not reported to the foreground channel callbacks"
  );
  Assert.equal(
    observer.progress,
    0,
    "background revalidation progress was not reported to the foreground channel callbacks"
  );
  Assert.notEqual(
    backgroundChannel.loadGroup,
    loadGroup,
    "background revalidation doesn't use the foreground load group"
  );
  Assert.notEqual(
    backgroundChannel.loadInfo,
    channel.loadInfo,
    "background revalidation doesn't share the loadInfo"
  );

  // The final /target response is not cacheable, so it comes from the network.
  response = await get_response(make_channel(URI), false);
  Assert.equal(response, TARGET_BODY, "revalidated redirect was cached");
});
