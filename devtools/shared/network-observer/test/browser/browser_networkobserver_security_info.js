/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TEST_URL = URL_ROOT + "doc_network-observer.html";

class SecurityInfoOwner extends NetworkEventOwner {
  addSecurityInfo(info) {
    super.addSecurityInfo();
    this.securityInfo = info;
  }
}

add_task(async function test_default_collects_security_info() {
  const { networkObserver, owner, tab } = await loadAndGetNetworkEvent({});

  await TestUtils.waitForCondition(() => owner.hasSecurityInfo);
  ok(
    owner.securityInfo.cert?.fingerprint?.sha256,
    "The certificate of the response was parsed"
  );

  networkObserver.destroy();
  gBrowser.removeTab(tab);
});

add_task(async function test_skip_security_info() {
  const { networkObserver, owner, tab } = await loadAndGetNetworkEvent({
    collectSecurityInfo: false,
  });

  ok(!owner.hasSecurityInfo, "No security info was received");

  networkObserver.destroy();
  gBrowser.removeTab(tab);
});

async function loadAndGetNetworkEvent(options) {
  const events = [];
  const networkObserver = new NetworkObserver({
    ...options,
    ignoreChannelFunction: channel => channel.URI.spec !== TEST_URL,
    onNetworkEvent: () => {
      const owner = new SecurityInfoOwner();
      events.push(owner);
      return owner;
    },
  });

  const tab = await addTab(TEST_URL);

  info("Wait for the response of the document request to complete");
  await TestUtils.waitForCondition(() => events.length >= 1);
  is(events.length, 1, "Received the expected number of network events");
  await TestUtils.waitForCondition(() => events[0].hasResponseContentComplete);

  return { networkObserver, owner: events[0], tab };
}
