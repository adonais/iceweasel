// META: script=/notifications/resources/helpers.js

const origin = "https://{{hosts[][]}}:{{ports[https][0]}}";
const data = {
  options: {
    action: "default",
    close: true,
    notificationCloseEvent: false,
    url: "https://tests.peter.sh/notification-generator/#"
  }
};
const storageEntry = {
  id: "foo",
  title: "bar",
  dir: "rtl",
  body: "baz",
  tag: "basil",
  icon: "https://example.com/",
  navigate: "https://example.org/",
  requireInteraction: false,
  silent: true,

  // corresponding to `data` above
  dataSerialized: "AgAAAAAA8f8AAAAACAD//wcAAIAEAP//b3B0aW9ucwAAAAAACAD//wYAAIAEAP//YWN0aW9uAAAHAACABAD//2RlZmF1bHQABQAAgAQA//9jbG9zZQAAAAEAAAACAP//FgAAgAQA//9ub3RpZmljYXRpb25DbG9zZUV2ZW50AAAAAAAAAgD//wMAAIAEAP//dXJsAAAAAAAvAACABAD//2h0dHBzOi8vdGVzdHMucGV0ZXIuc2gvbm90aWZpY2F0aW9uLWdlbmVyYXRvci8jAAAAAAATAP//AAAAABMA//8=",
  actions: [
    { name: "basilisk", title: "obelisk" },
    { name: "test", title: "test with navigate", navigate: "https://mozilla.org/" },
  ],
  serviceWorkerRegistrationScope: `${origin}/_mozilla/notifications/`
};

promise_setup(async () => {
  await prepareActiveServiceWorker("simulate-click-handler-sw.js");
})

/**
 * @param {object} options
 * @param {boolean} options.autoClosed
 */
async function simulateClickingExistingNotification(t, { autoClosed }) {
  await SpecialPowers.spawnChrome([origin, storageEntry, autoClosed], async (origin, storageEntry, autoClosed) => {
    // Simulate an existing notification
    const svc = Cc["@mozilla.org/notificationStorage;1"].getService(Ci.nsINotificationStorage);
    svc.put(origin, storageEntry, storageEntry.serviceWorkerRegistrationScope);

    const uri = Services.io.newURI(origin);
    const principal = Services.scriptSecurityManager.createContentPrincipal(uri, {});

    // Now simulate a click
    const handler = Cc["@mozilla.org/notification-handler;1"].getService(Ci.nsINotificationHandler);
    handler.respondOnClick(principal, storageEntry.id, "basilisk", autoClosed);
  });

  t.add_cleanup(async () => {
    await SpecialPowers.spawnChrome([origin, storageEntry.id], async (origin, id) => {
      const svc = Cc["@mozilla.org/notificationStorage;1"].getService(Ci.nsINotificationStorage);
      return svc.delete(origin, id);
    });
  })
}

async function getFromDB() {
  return await SpecialPowers.spawnChrome([origin, storageEntry.id], async (origin, id) => {
    const svc = Cc["@mozilla.org/notificationStorage;1"].getService(Ci.nsINotificationStorage);
    return svc.getById(origin, id);
  });
}

promise_test(async (t) => {
  const promise = new Promise(r => {
    navigator.serviceWorker.addEventListener("message", r, { once: true })
  });

  await simulateClickingExistingNotification(t, { autoClosed: false });

  /** @type {NotificationEvent} */
  const { data: { notification, action } } = await promise;

  assert_equals(notification.title, storageEntry.title);
  assert_equals(notification.dir, storageEntry.dir);
  assert_equals(notification.body, storageEntry.body);
  assert_equals(notification.tag, storageEntry.tag);
  assert_equals(notification.icon, storageEntry.icon);
  assert_equals(notification.navigate, storageEntry.navigate);
  assert_object_equals(notification.actions, [
    { action: "basilisk", title: "obelisk" },
    { action: "test", title: "test with navigate", navigate: "https://mozilla.org/" },
  ]);
  assert_object_equals(notification.data, data);
  assert_equals(action, "basilisk");

  const entry = await getFromDB();
  assert_true(!!entry, "The entry should still be there");
}, "Fire notificationclick via NotificationHandler autoClosed: false");

promise_test(async (t) => {
  const promise = new Promise(r => {
    navigator.serviceWorker.addEventListener("message", r, { once: true })
  });

  await simulateClickingExistingNotification(t, { autoClosed: true });

  await promise;

  const entry = await getFromDB();
  assert_true(!entry, "The entry should not be there");
}, "Fire notificationclick via NotificationHandler with autoClosed: true");

const scopeTests = {
  [`view-source:${location.origin}`]: "Scope URL's scheme is not 'http' or 'https'",
  [`${location.origin}/%2f/foo`]: "contains %2f or %5c",
  [`${location.origin}/%5c/foo`]: "contains %2f or %5c",
  "https://example.com": "Non-same-origin scope URL",
  [`${location.origin}/#foo`]: "Non-empty fragment on scope URL",
}
for (const [scope, expect] of Object.entries(scopeTests)) {
  promise_test(async (t) => {
    const error = await SpecialPowers.spawnChrome([origin, storageEntry, scope], async (origin, storageEntry, scope) => {
      const svc = Cc["@mozilla.org/notificationStorage;1"].getService(Ci.nsINotificationStorage);
      svc.put(origin, storageEntry, scope);

      const uri = Services.io.newURI(origin);
      const principal = Services.scriptSecurityManager.createContentPrincipal(uri, {});

      // Now simulate a click
      const handler = Cc["@mozilla.org/notification-handler;1"].getService(Ci.nsINotificationHandler);
      await handler.respondOnClick(principal, storageEntry.id, "basilisk", false);
    }).then(() => { throw new Error("No error") }, err => SpecialPowers.wrap(err));
    console.log(error.message);
    assert_true(error.message.includes(expect), "Invalid scope should fail");
  }, `With ${scope}`);
}
