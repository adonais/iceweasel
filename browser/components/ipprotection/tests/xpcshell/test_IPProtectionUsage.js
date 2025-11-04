/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { IPProtectionUsage } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPProtectionUsage.sys.mjs"
);
const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);
const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
const lazy = XPCOMUtils.declareLazy({
  ProxyService: {
    service: "@mozilla.org/network/protocol-proxy-service;1",
    iid: Ci.nsIProtocolProxyService,
  },
});

/**
 * Creates a new channel for the given URI.
 *
 * @param {*} aUri the URI to create the channel for.
 * @param {*} method the HTTP method to use (default: "GET").
 * @param {*} body the request body (for POST requests).
 * @param {*} proxyInfo proxy information (if any) makes this channel a proxied channel.
 * @returns {nsIHttpChannel | nsIProxiedChannel}
 */
function makeChannel(aUri, method = "GET", body = null, proxyInfo = null) {
  let channel;
  if (proxyInfo) {
    let httpHandler = Services.io.getProtocolHandler("http");
    httpHandler.QueryInterface(Ci.nsIProxiedProtocolHandler);
    let uri = Services.io.newURI(aUri);

    let { loadInfo } = NetUtil.newChannel({
      uri,
      loadUsingSystemPrincipal: true,
    });

    channel = httpHandler.newProxiedChannel(
      uri,
      proxyInfo,
      0, // proxy resolve flags
      null, // proxy resolve URI
      loadInfo
    );
  } else {
    channel = NetUtil.newChannel({
      uri: aUri,
      loadUsingSystemPrincipal: true,
    }).QueryInterface(Ci.nsIHttpChannel);
    channel.requestMethod = method;
  }

  if (body) {
    let stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(
      Ci.nsIStringInputStream
    );
    stream.setUTF8Data(body);
    channel
      .QueryInterface(Ci.nsIUploadChannel)
      .setUploadStream(stream, "text/plain", body.length);
  }
  return channel;
}

function promiseChannelDone(chan) {
  return new Promise((resolve, reject) => {
    chan.asyncOpen(new ChannelListener(resolve, reject));
  });
}

/**
 * Mocks a channel listener.
 */
class ChannelListener {
  constructor(resolve, reject) {
    this.resolve = resolve;
    this.reject = reject;
  }
  onStartRequest() {}
  onDataAvailable() {}
  onStopRequest() {
    this.resolve();
  }
}

/**
 *  • Creates a profile dir & initialises FOG.
 *  • Resets/flushes metrics so each test starts clean.
 *  • Spins‑up an HttpServer, hands its URL to the test body, then stops it.
 *
 * @param {string}   path      Path for the single route, e.g. "/get".
 * @param {Function} handler   httpd.js style path handler.
 * @param {Function} testBody  async fn(url:string):void – the real test.
 */
async function withSetup(path, handler, testBody) {
  do_get_profile();
  Services.fog.initializeFOG();

  await Services.fog.testFlushAllChildren();
  Services.fog.testResetFOG();

  let server = new HttpServer();
  server.registerPathHandler(path, handler);
  server.start(-1);
  let port = server.identity.primaryPort;
  let url = `http://localhost:${port}${path}`;

  try {
    await testBody(url);
  } finally {
    await new Promise(r => server.stop(r));
    await Services.fog.testResetFOG();
  }
}

add_task(async function test_countChannel_get() {
  await withSetup(
    "/get",
    (req, resp) => {
      resp.setStatusLine(req.httpVersion, 200, "OK");
      resp.write("hello world");
    },
    async url => {
      let channel = makeChannel(url, "GET");
      await promiseChannelDone(channel);

      IPProtectionUsage.countChannel(channel);

      Assert.greater(
        Glean.ipprotection.usageRx.testGetValue().sum,
        0,
        "usageRx should have recorded bytes"
      );
      Assert.greater(
        Glean.ipprotection.usageTx.testGetValue().sum,
        0,
        "usageTx should record for GET requests"
      );
    }
  );
});

add_task(async function test_countChannel_post() {
  await withSetup(
    "/post",
    (req, resp) => {
      let body = NetUtil.readInputStreamToString(
        req.bodyInputStream,
        req.bodyInputStream.available()
      );
      Assert.equal(
        body,
        "some data",
        "Request body should contain 'some data'"
      );
      resp.setStatusLine(req.httpVersion, 200, "OK");
      resp.write("posted!");
    },
    async url => {
      let channel = makeChannel(url, "POST", "some data");
      await promiseChannelDone(channel);

      IPProtectionUsage.countChannel(channel);

      Assert.greater(
        Glean.ipprotection.usageRx.testGetValue().sum,
        0,
        "usageRx should have recorded bytes"
      );
      Assert.greater(
        Glean.ipprotection.usageTx.testGetValue().sum,
        0,
        "usageTx should record bytes for POST requests"
      );
    }
  );
});

add_task(async function test_countChannel_cache() {
  await withSetup(
    "/cache",
    (req, resp) => {
      resp.setStatusLine(req.httpVersion, 200, "OK");
      resp.setHeader("Cache-Control", "max-age=1000", false);
      resp.write("cached response");
    },
    async url => {
      let channel = makeChannel(url, "GET");
      await promiseChannelDone(channel);

      IPProtectionUsage.countChannel(channel);

      const afterRx = Glean.ipprotection.usageRx.testGetValue().sum;
      Assert.greater(
        afterRx,
        0,
        "usageRx should record bytes for first network request"
      );

      let channel2 = makeChannel(url, "GET");
      await promiseChannelDone(channel2);

      IPProtectionUsage.countChannel(channel2);

      Assert.equal(
        afterRx,
        Glean.ipprotection.usageRx.testGetValue().sum,
        "usageRx should not record bytes for cached request"
      );
    }
  );
});

add_task(async function test_shouldCountChannel() {
  const usage = new IPProtectionUsage();
  const makeInfo = key => {
    return lazy.ProxyService.newProxyInfo(
      "http",
      "127.0.0.1",
      8888,
      "authToken",
      key,
      1, // TRANSPARENT_PROXY_RESOLVES_HOST
      100,
      null // Failover proxy info
    );
  };

  const trackedIsolationKey = "is-tracked";

  usage.addIsolationKey(trackedIsolationKey);
  let testCases = [
    {
      info: makeInfo(trackedIsolationKey),
      result: true,
      description: "Tracked proxy info should be counted",
    },
    {
      info: undefined,
      result: false,
      description: "No proxy info should not be counted",
    },
    {
      info: makeInfo("is-untracked"),
      result: false,
      description: "Untracked proxy info should not be counted",
    },
    {
      info: makeInfo(""),
      result: false,
      description: "proxy info with empty isolation key should not be counted",
    },
  ];
  for (let { info, result, description } of testCases) {
    let channel = makeChannel("http://example.com", "GET", null, info);
    let shouldCount = usage.shouldCountChannel(channel);
    Assert.equal(
      shouldCount,
      result,
      `shouldCountChannel should return ${result} for ${description}`
    );
  }
});
