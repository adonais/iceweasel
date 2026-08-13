"use strict";

// A compromised child could forge a raw IPC message reusing another portId
// to join a channel it shouldn't have access to.

// The forged outbound PortMessages below are rejected in the parent,
// which surfaces as uncaught rejections; they are expected.
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /Unknown sender or wrong actor for recvPortMessage/
);

add_task(async function test_fake_conduits_receive_nothing() {
  let ext = ExtensionTestUtils.loadExtension({
    background() {
      browser.runtime.onConnect.addListener(port => {
        port.onMessage.addListener(msg => {
          if (msg === "SECRET") {
            port.postMessage("ACK");
          } else {
            browser.test.fail(`Receiver got a forged message: ${msg}`);
          }
        });
      });
    },
    files: {
      "page.html": `<!DOCTYPE html><meta charset="utf8"><script src="page.js"></script>`,
      "page.js"() {
        let port = browser.runtime.connect();
        port.onMessage.addListener(msg => {
          if (msg === "ACK") {
            browser.test.sendMessage("got-ack");
          }
        });
        browser.test.onMessage.addListener(msg => {
          if (msg === "post-secret") {
            port.postMessage("SECRET");
          }
        });
        browser.test.sendMessage("page-ready");
      },
    },
  });

  await ext.startup();
  let url = `moz-extension://${ext.uuid}/page.html`;
  let page = await ExtensionTestUtils.loadContentPage(url, { extension: ext });
  await ext.awaitMessage("page-ready");

  // Open fake conduits for both source and receiver using a live portId.
  // They share the page's actor, so IPC ordering would put any leaked
  // message before the round-trip ACK. Neither should receive anything.
  let { messages } = await promiseConsoleOutput(async () => {
    await page.spawn([ext.id], extensionId => {
      let actor = content.windowGlobalChild.getActor("Conduits");
      let port = [...actor.conduits.values()].find(c => c.address?.portId);

      // One fake subject for both port ends, a leak on either fails the test.
      let fakeSubj = {
        recvPortMessage(arg) {
          Assert.ok(
            false,
            `Fake conduit received a message: ${JSON.stringify(arg)}`
          );
        },
        recvPortDisconnect() {
          Assert.ok(false, "Fake conduit received a disconnect");
        },
      };

      for (let source of [true, false]) {
        // Forges openConduit call from ExtensionChild.Port constructor.
        let conduit = actor.openConduit(fakeSubj, {
          id: source ? "fake@src" : "fake@rcv",
          portId: port.address.portId,
          source,
          extensionId,
          envType: "addon_child",
          recv: ["PortMessage", "PortDisconnect"],
          send: ["PortMessage"],
        });

        // Forge a message; parent drops it because the conduit was rejected.
        conduit.sendPortMessage({ message: "INJECT" });
      }
    });

    // Round-trip so the veto logs (and any leak) land before capture ends.
    ext.sendMessage("post-secret");
    await ext.awaitMessage("got-ack");
  });

  Assert.ok(
    messages.some(m => m.message?.includes("Duplicate port source")),
    "Parent logged the duplicate source"
  );
  Assert.ok(
    messages.some(m => m.message?.includes("Unknown port receiver")),
    "Parent logged the unknown receiver"
  );
  Assert.equal(
    messages.filter(m =>
      m.message?.includes("Unknown sender or wrong actor for recvPortMessage")
    ).length,
    2,
    "Parent rejected both forged outbound messages"
  );

  await page.close();
  await ext.unload();
});
