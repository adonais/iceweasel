/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { IPPChannelFilter } = ChromeUtils.importESModule(
  "resource:///modules/ipprotection/IPPChannelFilter.sys.mjs"
);

add_task(async function test_createConnection_and_proxy() {
  await withProxyServer(async proxyInfo => {
    // Create the IPP connection filter
    const filter = IPPChannelFilter.create();
    filter.initialize("", proxyInfo.host, proxyInfo.port, proxyInfo.type);
    filter.start();

    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      // Note: this will not be loaded as the proxy will refuse the connection
      // eslint-disable-next-line @microsoft/sdl/no-insecure-url
      "http://example.com/"
    );

    await proxyInfo.gotConnection;
    await BrowserTestUtils.removeTab(tab);
    filter.stop();
  });
});

add_task(async function test_exclusion_and_proxy() {
  const server = new HttpServer();
  server.registerPathHandler("/", (request, response) => {
    response.setStatusLine(request.httpVersion, 200, "OK");
    response.setHeader("Content-Type", "text/plain");
    response.write("Hello World");
  });
  server.start(-1);

  await withProxyServer(async proxyInfo => {
    // Create the IPP connection filter
    const filter = IPPChannelFilter.create([
      "http://localhost:" + server.identity.primaryPort,
    ]);
    filter.initialize("", proxyInfo.host, proxyInfo.port, proxyInfo.type);
    proxyInfo.gotConnection.then(() => {
      Assert.ok(false, "Proxy connection should not be made for excluded URL");
    });
    filter.start();

    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      // eslint-disable-next-line @microsoft/sdl/no-insecure-url
      "http://localhost:" + server.identity.primaryPort
    );
    await BrowserTestUtils.removeTab(tab);
    filter.stop();
  });
});

add_task(async function test_essential_exclusion() {
  const server = new HttpServer();
  server.registerPathHandler("/", (request, response) => {
    response.setStatusLine(request.httpVersion, 200, "OK");
    response.setHeader("Content-Type", "text/plain");
    response.write("Hello World");
  });
  server.start(-1);

  await withProxyServer(async proxyInfo => {
    // Create the IPP connection filter
    const filter = IPPChannelFilter.create();
    // Add essential URL to exclusion list
    filter.addEssentialExclusion(
      "http://localhost:" + server.identity.primaryPort
    );
    filter.initialize("", proxyInfo.host, proxyInfo.port, proxyInfo.type);
    proxyInfo.gotConnection.then(() => {
      Assert.ok(false, "Proxy connection should not be made for excluded URL");
    });
    filter.start();

    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      // eslint-disable-next-line @microsoft/sdl/no-insecure-url
      "http://localhost:" + server.identity.primaryPort
    );
    await BrowserTestUtils.removeTab(tab);
    filter.stop();
  });
});

add_task(async function test_channel_suspend_resume() {
  const server = new HttpServer();
  server.registerPathHandler("/", (request, response) => {
    response.setStatusLine(request.httpVersion, 200, "OK");
    response.setHeader("Content-Type", "text/plain");
    response.write("Hello World");
  });
  server.start(-1);

  await withProxyServer(async proxyInfo => {
    // Create the IPP connection filter
    const filter = IPPChannelFilter.create();
    filter.start();

    let tab = BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      // eslint-disable-next-line @microsoft/sdl/no-insecure-url
      "http://localhost:" + server.identity.primaryPort
    );

    const pendingChannels = new Promise(resolve => {
      const id = setInterval(() => {
        if (filter.hasPendingChannels) {
          clearInterval(id);
          resolve(true);
        }
      }, 500);

      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      setTimeout(() => {
        clearInterval(id);
        resolve(false);
      }, 5000);
    });

    Assert.ok(
      await pendingChannels,
      "Proxy connection qeues channels when not initialized"
    );

    filter.initialize("", proxyInfo.host, proxyInfo.port, proxyInfo.type);

    Assert.ok(!filter.hasPendingChannels, "All the pending channels are gone.");

    await BrowserTestUtils.removeTab(await tab);
    filter.stop();
  });
});

// Second test: check observer and proxy info on channel
add_task(async function channelfilter_proxiedChannels() {
  // Disable DOH, as otherwise the iterator will have
  // mozilla-clouldflare-dns as the first channel.
  await SpecialPowers.pushPrefEnv({
    set: [["network.trr.mode", 0]], // Disable DNS-over-HTTPS for this test
  });

  await withProxyServer(async proxyInfo => {
    const filter = IPPChannelFilter.create();
    filter.initialize("", proxyInfo.host, proxyInfo.port, proxyInfo.type);
    filter.start();
    const channelIter = filter.proxiedChannels();
    let nextChannel = channelIter.next();

    let tab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      // Note: this will not be loaded as the proxy will refuse the connection
      // eslint-disable-next-line @microsoft/sdl/no-insecure-url
      "http://example.com/"
    );
    let { value, done } = await nextChannel;
    Assert.equal(done, false, "Iterator should not be done yet");

    Assert.notEqual(value, null, "Channel should not be null");
    // Assert that the channel loaded example.com
    Assert.ok(
      value.URI.host === "example.com" ||
        value.URI.host === "mozilla.cloudflare-dns.com",
      "Channel should load example.com or mozilla.cloudflare-dns.com"
    );
    await BrowserTestUtils.removeTab(tab);
    filter.stop();

    ({ value, done } = await channelIter.next());
    Assert.equal(
      done,
      true,
      "Iterator should be done after stopping the filter"
    );
  });
});
