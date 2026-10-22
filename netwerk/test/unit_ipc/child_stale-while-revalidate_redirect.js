"use strict";

/* global NetUtil, ChannelListener */

// Holds the redirect of the foreground channel until the background
// revalidation is done, so both redirects are pending at the same time.
class HeldRedirectSink {
  redirects = 0;
  heldCallback = null;

  constructor() {
    this.secondRedirect = new Promise(resolve => {
      this.onSecondRedirect = resolve;
    });
  }

  QueryInterface = ChromeUtils.generateQI([
    "nsIInterfaceRequestor",
    "nsIChannelEventSink",
  ]);

  getInterface(iid) {
    return this.QueryInterface(iid);
  }

  asyncOnChannelRedirect(oldChannel, newChannel, flags, callback) {
    this.redirects++;
    if (this.heldCallback) {
      this.onSecondRedirect();
      callback.onRedirectVerifyCallback(Cr.NS_BINDING_ABORTED);
      return;
    }
    this.heldCallback = callback;
  }

  release() {
    this.heldCallback?.onRedirectVerifyCallback(Cr.NS_OK);
  }
}

function make_channel(url) {
  return NetUtil.newChannel({
    uri: url,
    loadUsingSystemPrincipal: true,
  }).QueryInterface(Ci.nsIHttpChannel);
}

function get_response(channel) {
  return new Promise(resolve => {
    channel.asyncOpen(
      new ChannelListener((request, buffer, ctx, isFromCache) =>
        resolve({ buffer, isFromCache })
      )
    );
  });
}

function sleep(time) {
  return new Promise(resolve => {
    do_timeout(time * 1000, resolve);
  });
}

add_task(async function test_background_redirect_not_forwarded_to_child() {
  do_send_remote_message("start-test");
  const base = await do_await_remote_message("start-test-done");
  const URI = `${base}/redirect`;

  let { buffer } = await get_response(make_channel(URI));
  Assert.equal(buffer, "target", "first load followed the redirect");

  // Let the cached redirect become stale, within the revalidation window.
  await sleep(2);

  let revalidationDone = do_await_remote_message("revalidation-done");
  let sink = new HeldRedirectSink();
  let channel = make_channel(URI);
  channel.notificationCallbacks = sink;
  let response = get_response(channel);

  await Promise.race([revalidationDone, sink.secondRedirect]);
  Assert.equal(
    sink.redirects,
    1,
    "the background revalidation redirect was not forwarded to the child"
  );

  sink.release();
  ({ buffer } = await response);
  Assert.equal(buffer, "target", "the stale redirect was followed");
});
