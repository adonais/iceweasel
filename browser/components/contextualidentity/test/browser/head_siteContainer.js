"use strict";

const BASE_COM = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
);
const BASE_ORG = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.org"
);
const BASE_NET = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.net"
);
const BASE_TEST1 = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://test1.example.org"
);
const URL_COM = BASE_COM + "blank.html";
const URL_ORG = BASE_ORG + "blank.html";
const URL_TEST1 = BASE_TEST1 + "blank.html";

// "example.org" is bound to this container; "example.com" is unbound.
const BOUND_CONTAINER = 2;
const OTHER_CONTAINER = 1;

function setContainerCookie(host, value, userContextId) {
  Services.cookies.add(
    host,
    "/",
    "ck",
    value,
    true /* secure */,
    false /* httpOnly */,
    false /* session */,
    Date.now() + 24 * 60 * 60 * 1000,
    { userContextId },
    Ci.nsICookie.SAMESITE_NONE,
    Ci.nsICookie.SCHEME_HTTPS
  );
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["privacy.userContext.enabled", true],
      ["privacy.containers.switchDuringNavigation.enabled", true],
    ],
  });

  ContextualIdentityService.setSiteAssociation("example.org", BOUND_CONTAINER);
  registerCleanupFunction(() => {
    ContextualIdentityService.removeSiteAssociation("example.org");
  });
});

// The origin attributes a content process is dedicated to, encoded in the
// origin suffix of its remote type. Only web remote types carry them.
function processOriginAttributes(remoteType) {
  let suffix = remoteType.indexOf("^");
  return ChromeUtils.CreateOriginAttributesFromOriginSuffix(
    suffix === -1 ? "" : remoteType.slice(suffix)
  );
}

async function assertContainer(tab, expected, msg) {
  is(tab.userContextId, expected, `${msg}: tab.userContextId`);
  await SpecialPowers.spawn(tab.linkedBrowser, [expected, msg], (exp, m) => {
    Assert.equal(
      content.docShell.getOriginAttributes().userContextId,
      exp,
      `${m}: docShell userContextId`
    );
  });

  // The right principal is not enough: process isolation must also have picked
  // a process dedicated to the same container.
  let remoteType = tab.linkedBrowser.remoteType;
  if (remoteType && E10SUtils.isWebRemoteType(remoteType)) {
    is(
      processOriginAttributes(remoteType).userContextId,
      expected,
      `${msg}: userContextId of the content process (${remoteType})`
    );
  }

  let identity = ContextualIdentityService.getPublicIdentityFromId(expected);
  let name = ContextualIdentityService.getUserContextLabel(expected);

  ok(
    tab.classList.contains(`identity-color-${identity.color}`),
    `${msg}: tab shows color identity-color-${identity.color}`
  );

  if (tab.selected) {
    let icons = document.getElementById("userContext-icons");
    ok(!icons.hidden, `${msg}: URL bar container indicator is visible`);
    ok(
      icons.classList.contains(`identity-color-${identity.color}`),
      `${msg}: URL bar shows color identity-color-${identity.color}`
    );
    is(
      document.getElementById("userContext-label").textContent,
      name,
      `${msg}: URL bar shows container name`
    );
    ok(
      document
        .getElementById("userContext-indicator")
        .classList.contains(`identity-icon-${identity.icon}`),
      `${msg}: URL bar shows icon identity-icon-${identity.icon}`
    );
  }
}

// Opens a tab in aContainer at aUrl, which must not be bound to another
// container or the load itself would be retargeted. Unlike head.js's
// openTabInUserContext, this waits for aUrl specifically (about:blank included)
// and can leave the tab in the background.
async function openTabIn(container, url = URL_COM, { select = true } = {}) {
  let tab = BrowserTestUtils.addTab(gBrowser, url, {
    userContextId: container,
  });
  if (select) {
    gBrowser.selectedTab = tab;
  }
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, url);
  return tab;
}

// Starts a load expected to be retargeted, and resolves with the new tab.
function loadRetargeted(tab, url, wantLoad = url) {
  let retargeted = BrowserTestUtils.waitForNewTab(gBrowser, wantLoad, true);
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, url);
  return retargeted;
}

// Opens a tab in aFrom, starts a load expected to be retargeted, and resolves
// with both tabs once the load landed in aTo.
async function retargetFrom(
  from,
  to,
  url,
  msg,
  { start = URL_COM, wantLoad = url } = {}
) {
  let tab = await openTabIn(from, start);
  let retargeted = await loadRetargeted(tab, url, wantLoad);
  await assertContainer(retargeted, to, msg);
  return { tab, retargeted };
}

// The load was moved away, not undone: the tab keeps everything it had.
async function assertLeftBehind(tab, url, container, msg) {
  ok(tab.isConnected, `${msg}: is still open`);
  is(tab.linkedBrowser.currentURI.spec, url, `${msg}: kept its document`);
  ok(!tab.linkedBrowser.canGoBack, `${msg}: no history entry was added`);
  ok(!tab.linkedBrowser.canGoForward, `${msg}: no forward history entry`);
  await assertContainer(tab, container, `${msg}: kept its container`);
}

// Asserts aFn opened no tab, i.e. its load stayed where it started.
async function assertNoRetarget(tabbrowser, msg, fn) {
  let opened = [];
  let onTabOpen = event => opened.push(event.target);
  tabbrowser.tabContainer.addEventListener("TabOpen", onTabOpen);
  try {
    await fn();
  } finally {
    tabbrowser.tabContainer.removeEventListener("TabOpen", onTabOpen);
  }
  is(opened.length, 0, `${msg}: the load was not retargeted into a new tab`);
}

async function navigateTo(tab, url) {
  let loaded = BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, url);
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, url);
  await loaded;
}

// Runs aFn with aPrefs set, restoring them whatever happens: a pref left behind
// would change how every later task loads.
async function withPrefs(aPrefs, aFn) {
  await SpecialPowers.pushPrefEnv({ set: aPrefs });
  try {
    await aFn();
  } finally {
    await SpecialPowers.popPrefEnv();
  }
}
