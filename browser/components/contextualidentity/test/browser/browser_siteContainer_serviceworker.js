"use strict";

/* import-globals-from head_siteContainer.js */
loadTestSubscript("head_siteContainer.js");

// The example.org cookies of one container, by name.
function orgCookies(userContextId) {
  let out = new Map();
  for (let cookie of Services.cookies.getCookiesWithOriginAttributes(
    JSON.stringify({ userContextId }),
    "example.org"
  )) {
    out.set(cookie.name, cookie.value);
  }
  return out;
}

const swm = Cc["@mozilla.org/serviceworkers/manager;1"].getService(
  Ci.nsIServiceWorkerManager
);

// The service worker registrations of the bound site, in any container.
function orgServiceWorkers() {
  let out = [];
  let registrations = swm.getAllRegistrations();
  for (let i = 0; i < registrations.length; i++) {
    let info = registrations.queryElementAt(
      i,
      Ci.nsIServiceWorkerRegistrationInfo
    );
    if (info.principal.originNoSuffix === "https://example.org") {
      out.push(info);
    }
  }
  return out;
}

function promiseOrgServiceWorker() {
  if (orgServiceWorkers().length) {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    let listener = {
      onRegister() {
        if (orgServiceWorkers().length) {
          swm.removeListener(listener);
          resolve();
        }
      },
    };
    swm.addListener(listener);
  });
}

// A registration left behind would serve the loads of every later task.
async function unregisterOrgServiceWorkers() {
  for (let info of orgServiceWorkers()) {
    await new Promise(resolve => {
      swm.unregister(
        info.principal,
        {
          unregisterSucceeded() {
            resolve();
          },
          unregisterFailed() {
            ok(false, "unregister should succeed");
            resolve();
          },
        },
        info.scope
      );
    });
  }
}

// SW registrations are partitioned by userContextId, so one created by a
// retargeted load must be keyed to the container it landed in.
add_task(async function test_service_worker_registers_in_bound_container() {
  const SW_URL = BASE_ORG + "serviceworker.html";

  try {
    let { tab, retargeted } = await retargetFrom(
      OTHER_CONTAINER,
      BOUND_CONTAINER,
      SW_URL,
      "Service worker page landed in the bound container",
      { start: "about:blank" }
    );

    await promiseOrgServiceWorker();

    let containers = orgServiceWorkers().map(r => r.principal.userContextId);
    ok(
      containers.includes(BOUND_CONTAINER),
      "service worker registered in the bound container"
    );
    ok(
      !containers.includes(OTHER_CONTAINER),
      "no service worker registered in the container the load started in"
    );

    BrowserTestUtils.removeTab(retargeted);
    BrowserTestUtils.removeTab(tab);
  } finally {
    await unregisterOrgServiceWorkers();
  }
});

// An intercepted navigation must be served by the SW of the container it lands
// in, not of the one it started in.
add_task(async function test_service_worker_intercepts_in_bound_container() {
  try {
    setContainerCookie("example.org", "boundJar", BOUND_CONTAINER);
    setContainerCookie("example.org", "otherJar", OTHER_CONTAINER);

    // Register the intercepting SW for example.org in the bound container.
    let { tab: regTab, retargeted: swTab } = await retargetFrom(
      OTHER_CONTAINER,
      BOUND_CONTAINER,
      URL_ORG,
      "SW registration page landed in the bound container",
      { start: "about:blank" }
    );

    await SpecialPowers.spawn(swTab.linkedBrowser, [], async () => {
      await content.navigator.serviceWorker.register(
        "siteContainer_sw_intercept.js",
        {
          scope: "./",
        }
      );
      await content.navigator.serviceWorker.ready;
    });

    // Navigate a fresh tab (starting in another container) to a path under the
    // SW scope; the retargeted load must be served by the bound container's SW.
    let markerURL = BASE_ORG + "sw_marker.html";
    let { tab, retargeted } = await retargetFrom(
      OTHER_CONTAINER,
      BOUND_CONTAINER,
      markerURL,
      "Intercepted navigation landed in the bound container"
    );

    let body = await SpecialPowers.spawn(
      retargeted.linkedBrowser,
      [],
      () => content.document.body.textContent
    );
    ok(
      body.includes("INTERCEPTED-BY-SW"),
      "Navigation was served by the bound container's service worker"
    );

    // The cookie the worker read tells which jar it reads from, the one it
    // wrote tells which jar it writes to.
    ok(
      body.includes("ck=boundJar"),
      `The worker read the bound container's cookie jar (${body.trim()})`
    );
    ok(
      !body.includes("otherJar"),
      "The worker did not read the jar of the container the load started in"
    );
    is(
      orgCookies(BOUND_CONTAINER).get("swck"),
      "fromSW",
      "The worker wrote into the bound container's cookie jar"
    );
    ok(
      !orgCookies(OTHER_CONTAINER).has("swck"),
      "The worker wrote nothing into the jar of the container it started in"
    );

    BrowserTestUtils.removeTab(retargeted);
    BrowserTestUtils.removeTab(tab);
    BrowserTestUtils.removeTab(swTab);
    BrowserTestUtils.removeTab(regTab);
  } finally {
    await unregisterOrgServiceWorkers();
    Services.cookies.removeAll();
  }
});
