// Have an iframe to use it for SpecialPowers.spawn
let iframe;

promise_setup(async () => {
  iframe = document.createElement("iframe");
  const { promise, resolve } = Promise.withResolvers();
  iframe.onload = resolve;
  document.body.append(iframe);
  await promise;
});

async function chromeWaitForError() {
  return await SpecialPowers.spawn(iframe, [], async () => {
    const name = "PushService:Register:KO";
    const { promise, resolve } = Promise.withResolvers();
    const listener = {
      receiveMessage(receivedMessage) {
        dump(JSON.stringify(receivedMessage) + "\n");
        if (receivedMessage?.name === name) {
          Services.cpmm.removeMessageListener(name, this);
          resolve(receivedMessage.data.errorMessage);
        }
      }
    };
    Services.cpmm.addMessageListener(name, listener);
    return await promise;
  });
}

promise_test(async () => {
  let errorMessage = chromeWaitForError("PushService:Register:KO");
  await SpecialPowers.spawn(iframe, [], async () => {
    await Services.cpmm.sendAsyncMessage("Push:Register", {
      scope: "chrome://fxa-device-update",
      appServerKey: [],
      requestID: "foo",
      principal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
  });
  assert_equals(await errorMessage, "Invalid principal", "Should report invalid principal");
}, "With system principal");

promise_test(async () => {
  let errorMessage = chromeWaitForError("PushService:Register:KO");
  await SpecialPowers.spawn(iframe, [], async () => {
    await Services.cpmm.sendAsyncMessage("Push:Register", {
      scope: "https://example.com",
      appServerKey: [],
      requestID: "foo",
      principal: Services.scriptSecurityManager.createContentPrincipalFromOrigin("https://example.net"),
    });
  });
  assert_equals(await errorMessage, "Invalid principal", "Should report invalid principal");
}, "With mismatching content principal");

const scopeTests = {
  [`view-source:${location.origin}`]: "Scope URL's scheme is not 'http' or 'https'",
  [`${location.origin}/%2f/foo`]: "contains %2f or %5c",
  [`${location.origin}/%5c/foo`]: "contains %2f or %5c",
  "https://example.com": "Non-same-origin scope URL",
  [`${location.origin}/#foo`]: "Non-empty fragment on scope URL",
}

for (const [scope, expect] of Object.entries(scopeTests))
promise_test(async () => {
  let errorMessage = chromeWaitForError("PushService:Register:KO");
  await SpecialPowers.spawn(iframe, [scope, location.origin], async (scope, origin) => {
    await Services.cpmm.sendAsyncMessage("Push:Register", {
      scope,
      appServerKey: [],
      requestID: "foo",
      principal: Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin),
    });
  });
  assert_true((await errorMessage).includes(expect), "Should report invalid scope");
}, `With ${scope}`);
