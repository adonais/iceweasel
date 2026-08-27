/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Bounce Tracking Protection vs. the per-site container association of Bug
 * 2052136: a top-level navigation to a site bound to a container is retargeted
 * into a new tab in that container.
 *
 * BTP keys its state on OriginAttributes and holds the extended navigation
 * record per tab, in a BounceTrackingState which snapshots the tab's
 * OriginAttributes once. Retargeting splits one extended navigation across two
 * tabs, so a chain's hops need not all run in the container its record is filed
 * under. Classification and purging must still follow the container each hop
 * actually ran in, and an extended navigation must keep its meaning across the
 * switch: its destination stays exempt, its intermediate hops stay classifiable.
 *
 * Expectations marked todo() are requirements which do not hold yet. Bug 2058145
 * tracks the work to make them hold, and Bug 2054941 has the investigation.
 *
 * Each task's comment starts with its navigation chain. A hop's container is in
 * parentheses where it matters, and "new tab" marks where the retarget moves the
 * load out of the tab it started in.
 */

requestLongerTimeout(6);

// Any two distinct default containers.
const BOUND_CONTAINER = 2;
const OTHER_CONTAINER = 1;

const OA_DEFAULT = {};
const OA_BOUND = { userContextId: BOUND_CONTAINER };
const OA_OTHER = { userContextId: OTHER_CONTAINER };

// A host under SITE_B, to which an association can be bound on its own.
const SITE_SUB_B = `test1.${SITE_B}`;
const ORIGIN_SUB_B = `https://${SITE_SUB_B}`;

const bounceTrackingProtection = Cc[
  "@mozilla.org/bounce-tracking-protection;1"
].getService(Ci.nsIBounceTrackingProtection);

function originIn(origin, originAttributes) {
  return Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI(origin),
    originAttributes
  ).origin;
}

const ORIGIN_TRACKER_BOUND = originIn(ORIGIN_TRACKER, OA_BOUND);

function url(origin, file = "file_start.html") {
  return getBaseUrl(origin) + file;
}

function candidateHosts(originAttributes) {
  return bounceTrackingProtection
    .testGetBounceTrackerCandidateHosts(originAttributes)
    .map(entry => entry.siteHost)
    .sort();
}

function userActivationHosts(originAttributes) {
  return bounceTrackingProtection
    .testGetUserActivationHosts(originAttributes)
    .map(entry => entry.siteHost)
    .sort();
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "privacy.bounceTrackingProtection.mode",
        Ci.nsIBounceTrackingProtection.MODE_ENABLED,
      ],
      ["privacy.bounceTrackingProtection.bounceTrackingGracePeriodSec", 0],
      // Every extended navigation here is ended explicitly, so the client
      // bounce detection timeout must not flush a record halfway through.
      [
        "privacy.bounceTrackingProtection.clientBounceDetectionTimerPeriodMS",
        120000,
      ],
      ["privacy.userContext.enabled", true],
      ["privacy.containers.switchDuringNavigation.enabled", true],
    ],
  });
  bounceTrackingProtection.clearAll();
});

/**
 * Binds sites to containers for the duration of aFn, then restores the
 * associations and clears BTP and site data so tasks can't leak into each other.
 *
 * @param {Array<Array>} aAssociations - [site, userContextId] pairs to bind.
 * @param {Function} aFn - Test body.
 */
async function withSiteAssociations(aAssociations, aFn) {
  for (let [site, container] of aAssociations) {
    ContextualIdentityService.setSiteAssociation(site, container);
  }
  try {
    await aFn();
  } finally {
    for (let [site] of aAssociations) {
      ContextualIdentityService.removeSiteAssociation(site);
    }
    bounceTrackingProtection.clearAll();
    await SiteDataTestUtils.clear();
  }
}

/**
 * Asserts that none of the containers this file uses hold bounce tracker
 * candidates.
 *
 * @param {string} msg - Assertion message prefix.
 * @param {Array<number>} [except] - userContextIds to skip.
 */
function assertNoBTPState(msg, except = []) {
  for (let [name, container, oa] of [
    ["normal browsing", 0, OA_DEFAULT],
    [`container ${OTHER_CONTAINER}`, OTHER_CONTAINER, OA_OTHER],
    [`container ${BOUND_CONTAINER}`, BOUND_CONTAINER, OA_BOUND],
  ]) {
    if (except.includes(container)) {
      continue;
    }
    Assert.deepEqual(
      candidateHosts(oa),
      [],
      `${msg}: no bounce tracker candidates in ${name}`
    );
  }
}

/**
 * Opens a tab in the given container. aUrl must not be bound to another
 * container or the load which fills the tab would itself be retargeted.
 *
 * @param {number} userContextId - Container to open the tab in.
 * @param {string} aUrl - URL to load.
 * @returns {Promise<MozTabbrowserTab>} The opened tab.
 */
async function openTabIn(userContextId, aUrl = url(ORIGIN_A)) {
  let tab = BrowserTestUtils.addTab(gBrowser, aUrl, { userContextId });
  gBrowser.selectedTab = tab;
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, aUrl);
  return tab;
}

/**
 * Ends the extended navigation of aBrowser's tab: a user-activated navigation
 * runs RecordStatefulBounces for whatever record the tab holds. The target is
 * an unbound site, so this navigation is never itself retargeted.
 *
 * @param {MozBrowser} aBrowser - Browser whose extended navigation to end.
 * @returns {Promise} Resolves once bounces have been recorded.
 */
async function endExtendedNavigation(aBrowser) {
  let target = new URL(url(ORIGIN_A) + "?end");
  // The run this triggers is the first one for the browser after this point, so
  // take it whether or not it classified anything.
  let recorded = waitForRecordBounces(aBrowser, 0);
  let loaded = BrowserTestUtils.browserLoaded(aBrowser, false, target.href);
  await navigateLinkClick(aBrowser, target);
  await loaded;
  await recorded;
}

/**
 * Ends the extended navigation of aTab by closing it, which flushes the record
 * when the browsing context is discarded. Required wherever the tab's document
 * belongs to a host the task makes expectations about: endExtendedNavigation
 * clicks a link in that document, which records user activation for its site and
 * would exempt the site from classification for the next 45 days.
 *
 * @param {MozTabbrowserTab} aTab - Tab whose extended navigation to end.
 * @returns {Promise<Array<number>>} How many bounce tracker candidates each
 * record-bounces run for the tab classified, empty if it held no record.
 */
async function endExtendedNavigationByClosing(aTab) {
  let { browserId } = aTab.linkedBrowser.browsingContext;
  // A tab which never held a record produces no run at all, so collect the runs
  // rather than waiting for one.
  let candidateCounts = [];
  let observer = {
    observe(subject) {
      let propBag = subject.QueryInterface(Ci.nsIPropertyBag2);
      if (propBag.getProperty("browserId") == browserId) {
        candidateCounts.push(
          propBag.getProperty("bounceTrackerCandidateCount")
        );
      }
    },
  };
  Services.obs.addObserver(observer, OBSERVER_MSG_RECORD_BOUNCES_FINISHED);
  try {
    await BrowserTestUtils.removeTab(aTab);
    await TestUtils.waitForTick();
  } finally {
    Services.obs.removeObserver(observer, OBSERVER_MSG_RECORD_BOUNCES_FINISHED);
  }
  info(
    `Closing the tab ran record-bounces ${candidateCounts.length} time(s), ` +
      `classifying: ${JSON.stringify(candidateCounts)}`
  );
  return candidateCounts;
}

/**
 * Starts a navigation expected to be retargeted into a new tab.
 *
 * @param {MozBrowser} aBrowser - Browser to start the navigation in.
 * @param {URL} aTarget - URL to navigate to.
 * @param {URL} aWantLoad - URL the new tab is expected to end up at.
 * @returns {Promise<MozTabbrowserTab>} The tab the load was retargeted into.
 */
async function navigateRetargeted(aBrowser, aTarget, aWantLoad = aTarget) {
  let retargeted = BrowserTestUtils.waitForNewTab(
    gBrowser,
    aWantLoad.href,
    true
  );
  await navigateLinkClick(aBrowser, aTarget);
  return retargeted;
}

// example.com -> itisatracker.org -> example.org (container 2, new tab)
//
// A tracker which commits its own document before bouncing on is an
// intermediate hop of the extended navigation, not its destination. Moving the
// destination into another tab must not promote the tracker to destination: the
// tracker must be classified and purged, and the destination must not be
// classified in its place.
add_task(async function test_client_bounce_classifies_only_the_tracker() {
  await withSiteAssociations([[SITE_B, BOUND_CONTAINER]], async () => {
    assertNoBTPState("Before the bounce");

    let tab = await openTabIn(0);
    let targetURL = new URL(url(ORIGIN_B));
    let retargeted = await navigateRetargeted(
      tab.linkedBrowser,
      getBounceURL({
        bounceType: "client",
        targetURL,
        setState: "cookie-client",
      }),
      targetURL
    );

    is(
      retargeted.userContextId,
      BOUND_CONTAINER,
      "The destination landed in the container it is bound to"
    );
    is(
      tab.linkedBrowser.currentURI.host,
      SITE_TRACKER,
      "The tab which ran the chain still shows the tracker's document"
    );
    ok(
      SiteDataTestUtils.hasCookies(ORIGIN_TRACKER),
      "The tracker wrote its state in the container the bounce ran in"
    );

    // The tab shows the tracker's own document, so its extended navigation has
    // to end without interacting with it.
    await endExtendedNavigationByClosing(tab);

    todo(
      candidateHosts(OA_DEFAULT).includes(SITE_TRACKER),
      `${SITE_TRACKER} must be classified: it is an intermediate hop of the ` +
        `extended navigation, and the retarget of the destination does not ` +
        `make the tracker the destination`
    );
    todo(
      !candidateHosts(OA_DEFAULT).includes(SITE_B),
      `The destination ${SITE_B} must not be classified in the tracker's place`
    );

    let purged = await bounceTrackingProtection.testRunPurgeBounceTrackers();
    info(
      `Purge log: ${JSON.stringify(
        bounceTrackingProtection
          .testGetRecentlyPurgedTrackers(OA_DEFAULT)
          .map(entry => ({
            siteHost: entry.siteHost,
            initialHost: entry.bounceTrackingRecord?.initialHost,
            finalHost: entry.bounceTrackingRecord?.finalHost,
          }))
      )}`
    );

    todo(purged.includes(SITE_TRACKER), `${SITE_TRACKER} must be purged`);
    todo(
      !SiteDataTestUtils.hasCookies(ORIGIN_TRACKER),
      `The state ${SITE_TRACKER} collected while bouncing must be purged`
    );

    BrowserTestUtils.removeTab(retargeted);
  });
});

// example.com -> itisatracker.org (server) -> example.org (container 2, new tab)
//
// The destination of an extended navigation must stay exempt from classification
// wherever the container switch puts its document, and the container the load was
// retargeted into has no chain of its own to classify. A tracker which commits
// nothing, bouncing server side, must still be classified.
add_task(async function test_server_bounce_classifies_only_the_tracker() {
  await withSiteAssociations([[SITE_B, BOUND_CONTAINER]], async () => {
    assertNoBTPState("Before the bounce");

    let tab = await openTabIn(0);
    let targetURL = new URL(url(ORIGIN_B));
    let retargeted = await navigateRetargeted(
      tab.linkedBrowser,
      getBounceURL({ bounceType: "server", targetURL }),
      targetURL
    );

    is(
      retargeted.userContextId,
      BOUND_CONTAINER,
      "The destination landed in the container it is bound to"
    );
    is(
      tab.linkedBrowser.currentURI.spec,
      url(ORIGIN_A),
      "The tab which ran the chain kept its own document"
    );

    await endExtendedNavigation(tab.linkedBrowser);
    // Flushed by closing, so that ending it does not record user activation for
    // the destination and exempt it from the check below.
    await endExtendedNavigationByClosing(retargeted);

    ok(
      candidateHosts(OA_DEFAULT).includes(SITE_TRACKER),
      `${SITE_TRACKER} must be classified: its hop ran in this container`
    );

    todo(
      !candidateHosts(OA_DEFAULT).includes(SITE_B),
      `The destination ${SITE_B} must not be classified in the container the ` +
        `navigation started in: it is the destination of the extended ` +
        `navigation, not an intermediate hop`
    );

    Assert.deepEqual(
      candidateHosts(OA_BOUND),
      [],
      "The container the load was retargeted into must classify nothing"
    );

    BrowserTestUtils.removeTab(tab);
  });
});

// example.com -> itisatracker.org (container 2, new tab) -> example.org
//
// A tracker bound to a container runs its hops, and writes its state, in that
// container. It must be classified against the container its state lives in, so
// that a purge can reach it. Starting the record of the tab it was retargeted
// into must not exempt it.
add_task(async function test_bound_tracker_is_classified_in_its_container() {
  await withSiteAssociations([[SITE_TRACKER, BOUND_CONTAINER]], async () => {
    assertNoBTPState("Before the bounce");

    let tab = await openTabIn(0);
    let targetURL = new URL(url(ORIGIN_B));
    let retargeted = await navigateRetargeted(
      tab.linkedBrowser,
      getBounceURL({
        bounceType: "client",
        targetURL,
        setState: "cookie-client",
      }),
      targetURL
    );

    is(
      retargeted.userContextId,
      BOUND_CONTAINER,
      "The tracker's own load landed in the container it is bound to"
    );
    ok(
      SiteDataTestUtils.hasCookies(ORIGIN_TRACKER_BOUND),
      "The tracker holds state in the container it is bound to"
    );
    ok(
      !SiteDataTestUtils.hasCookies(ORIGIN_TRACKER),
      "The tracker holds no state in the container the navigation started in"
    );

    await endExtendedNavigation(retargeted.linkedBrowser);
    await endExtendedNavigation(tab.linkedBrowser);

    todo(
      candidateHosts(OA_BOUND).includes(SITE_TRACKER),
      `${SITE_TRACKER} must be classified in the container its hops ran in ` +
        `and its state lives in`
    );
    todo(
      !candidateHosts(OA_DEFAULT).includes(SITE_TRACKER),
      `${SITE_TRACKER} must not be classified against a container it never ` +
        `ran in, where a purge can reach nothing of its state`
    );

    BrowserTestUtils.removeTab(retargeted);
    BrowserTestUtils.removeTab(tab);
  });
});

// example.com (container 1) -> example.org (container 2, new tab)
//
// A site the user deliberately navigates to is the destination of that
// navigation, not an intermediate hop. Moving its document into another tab must
// not turn it into a bounce tracker in the container the user navigated from.
add_task(async function test_navigating_to_a_bound_site_classifies_nothing() {
  await withSiteAssociations([[SITE_B, BOUND_CONTAINER]], async () => {
    assertNoBTPState("Before the navigation");

    let tab = await openTabIn(OTHER_CONTAINER);
    let targetURL = new URL(url(ORIGIN_B));
    let retargeted = await navigateRetargeted(tab.linkedBrowser, targetURL);

    is(
      retargeted.userContextId,
      BOUND_CONTAINER,
      "The navigation landed in the container the site is bound to"
    );

    await endExtendedNavigation(tab.linkedBrowser);

    todo(
      !candidateHosts(OA_OTHER).includes(SITE_B),
      `A site the user navigated to deliberately must not be classified as a ` +
        `bounce tracker in the container the navigation started in`
    );

    BrowserTestUtils.removeTab(retargeted);
    BrowserTestUtils.removeTab(tab);
  });
});

// example.com (container 1) -> example.org (container 2, new tab + interaction)
//
// Interaction with a site must exempt it from classification wherever the
// container switch put its document. The activation is recorded against the
// container the document runs in, which is not the one the navigation started
// in, so the two must not be able to disagree about whether the site is exempt.
add_task(async function test_user_activation_exempts_the_retargeted_site() {
  await withSiteAssociations([[SITE_B, BOUND_CONTAINER]], async () => {
    assertNoBTPState("Before the navigation");

    let tab = await openTabIn(OTHER_CONTAINER);
    let targetURL = new URL(url(ORIGIN_B));
    let retargeted = await navigateRetargeted(tab.linkedBrowser, targetURL);

    info("Interact with the retargeted tab.");
    await SpecialPowers.spawn(retargeted.linkedBrowser, [], () => {
      SpecialPowers.wrap(content.document).notifyUserGestureActivation();
      content.document.userInteractionForTesting();
    });

    ok(
      userActivationHosts(OA_BOUND).includes(SITE_B),
      `User activation for ${SITE_B} is recorded in the container it runs in`
    );
    ok(
      !userActivationHosts(OA_OTHER).includes(SITE_B),
      `No user activation for ${SITE_B} in the container it was navigated from`
    );

    await endExtendedNavigation(tab.linkedBrowser);

    todo(
      !candidateHosts(OA_OTHER).includes(SITE_B),
      `Interacting with the site must exempt it from classification, wherever ` +
        `the container switch put the document`
    );

    BrowserTestUtils.removeTab(retargeted);
    BrowserTestUtils.removeTab(tab);
  });
});

// about:blank (container 1, closed) -> example.org (container 2, new tab)
//
// Opening a tab and going straight to a bound site is the flow the feature is
// built for, and closing the tab the load left behind (Bug 2052136 part 6) ends
// that tab's extended navigation immediately. Ending it must not classify the
// site the user asked for.
add_task(async function test_closing_the_disposable_tab_classifies_nothing() {
  await withSiteAssociations([[SITE_B, BOUND_CONTAINER]], async () => {
    assertNoBTPState("Before the navigation");

    let tab = await openTabIn(OTHER_CONTAINER, "about:blank");
    let targetURL = new URL(url(ORIGIN_B));

    // The record is flushed when the browsing context is discarded, which
    // happens while the tab is being removed. Collect the runs rather than
    // waiting for one: whether the closed tab classified anything at all is part
    // of what this task measures.
    let { browserId } = tab.linkedBrowser.browsingContext;
    let candidateCounts = [];
    let observer = {
      observe(subject) {
        let propBag = subject.QueryInterface(Ci.nsIPropertyBag2);
        if (propBag.getProperty("browserId") == browserId) {
          candidateCounts.push(
            propBag.getProperty("bounceTrackerCandidateCount")
          );
        }
      },
    };
    Services.obs.addObserver(observer, OBSERVER_MSG_RECORD_BOUNCES_FINISHED);

    let retargeted;
    try {
      let retargetedPromise = BrowserTestUtils.waitForNewTab(
        gBrowser,
        targetURL.href,
        true
      );
      await navigateSystemPrincipalLoad(tab.linkedBrowser, targetURL);
      retargeted = await retargetedPromise;

      await TestUtils.waitForCondition(
        () => !tab.isConnected,
        "The tab which only existed for the load was closed"
      );
      await TestUtils.waitForTick();
    } finally {
      Services.obs.removeObserver(
        observer,
        OBSERVER_MSG_RECORD_BOUNCES_FINISHED
      );
    }
    info(
      `Record-bounces runs for the closed tab classified: ` +
        `${JSON.stringify(candidateCounts)}`
    );

    is(
      retargeted.userContextId,
      BOUND_CONTAINER,
      "The load landed in the container the site is bound to"
    );
    todo(
      !candidateHosts(OA_OTHER).includes(SITE_B),
      `Opening a tab and going to a bound site must not classify ${SITE_B} ` +
        `in the container of the tab that was closed`
    );

    BrowserTestUtils.removeTab(retargeted);
  });
});

// example.com -> itisatracker.org -> example.org (container 2, new tab)
// -> example.net
//
// The container is re-decided on every hop and sticks once it changes: a chain
// which redirects through a bound site is retargeted into that container, and
// the hops after it stay there even though they are bound to nothing. The chain
// is therefore split across two containers, and each hop must be classified
// against the one it actually ran in.
add_task(async function test_each_hop_is_classified_in_its_own_container() {
  await withSiteAssociations([[SITE_B, BOUND_CONTAINER]], async () => {
    assertNoBTPState("Before the bounce");

    let tab = await openTabIn(0);
    let finalURL = new URL(url(ORIGIN_C));

    // example.com -> itisatracker.org -> example.org (bound) -> example.net
    let boundHopURL = new URL(url(ORIGIN_B, "file_bounce.sjs"));
    boundHopURL.searchParams.set("statusCode", 302);
    boundHopURL.searchParams.set("target", finalURL.href);
    boundHopURL.searchParams.set("setState", "cookie-server");

    let retargeted = await navigateRetargeted(
      tab.linkedBrowser,
      getBounceURL({ bounceType: "server", targetURL: boundHopURL }),
      finalURL
    );

    is(
      retargeted.userContextId,
      BOUND_CONTAINER,
      "The chain was retargeted into the container the bound hop is bound to"
    );
    is(
      tab.linkedBrowser.currentURI.spec,
      url(ORIGIN_A),
      "The tab which started the chain kept its own document"
    );
    is(tab.userContextId, 0, "and its container");
    ok(
      SiteDataTestUtils.hasCookies(originIn(ORIGIN_B, OA_BOUND)),
      "The bound hop ran in the container it is bound to"
    );

    await endExtendedNavigation(tab.linkedBrowser);
    // Flushed by closing: this task makes expectations about the destination,
    // and ending its navigation by clicking a link would record user activation
    // for it and exempt it from classification.
    await endExtendedNavigationByClosing(retargeted);

    ok(
      candidateHosts(OA_DEFAULT).includes(SITE_TRACKER),
      `${SITE_TRACKER} is classified in the container its hop ran in`
    );
    todo(
      !candidateHosts(OA_DEFAULT).includes(SITE_B),
      `The bound hop must not be classified in a container it never ran in`
    );
    todo(
      candidateHosts(OA_BOUND).includes(SITE_B),
      `The bound hop must be classified in the container its hop ran in`
    );
    todo(
      !candidateHosts(OA_DEFAULT).includes(SITE_C),
      `${SITE_C} is the destination of the extended navigation, and it never ran ` +
        `in the container the chain started in, so it must not be classified there`
    );

    BrowserTestUtils.removeTab(tab);
  });
});

// example.com -> example.org (container 2, new tab) -> itisatracker.org
// -> example.net
//
// A tracker bound to no container still runs in the container a preceding bound
// hop switched the chain into, and collects its state there. It has to be
// classified against that container: otherwise a purge looks in the container
// the chain started in, where the tracker holds nothing, and the state it
// collected survives. Every other expectation here is a site being classified
// or purged when it should not be; this one is a tracker escaping both.
add_task(async function test_unbound_tracker_is_classified_where_it_ran() {
  await withSiteAssociations([[SITE_B, BOUND_CONTAINER]], async () => {
    assertNoBTPState("Before the bounce");

    let tab = await openTabIn(0);
    let finalURL = new URL(url(ORIGIN_C));

    // The bound hop only redirects, so the tracker after it inherits the
    // container the chain was switched into rather than the tab's.
    let boundHopURL = new URL(url(ORIGIN_B, "file_bounce.sjs"));
    boundHopURL.searchParams.set("statusCode", 302);
    boundHopURL.searchParams.set(
      "target",
      getBounceURL({
        bounceType: "server",
        targetURL: finalURL,
        setState: "cookie-server",
      }).href
    );

    let retargeted = await navigateRetargeted(
      tab.linkedBrowser,
      boundHopURL,
      finalURL
    );

    is(
      retargeted.userContextId,
      BOUND_CONTAINER,
      "The chain was retargeted into the container the bound hop is bound to"
    );
    ok(
      SiteDataTestUtils.hasCookies(ORIGIN_TRACKER_BOUND),
      `${SITE_TRACKER}, bound to no container, collected its state in the ` +
        `container the chain was switched into`
    );
    ok(
      !SiteDataTestUtils.hasCookies(ORIGIN_TRACKER),
      "and none in the container the chain started in"
    );

    await endExtendedNavigation(tab.linkedBrowser);
    await endExtendedNavigationByClosing(retargeted);

    todo(
      candidateHosts(OA_BOUND).includes(SITE_TRACKER),
      `${SITE_TRACKER} must be classified in the container its hop ran in and ` +
        `its state lives in`
    );
    todo(
      !candidateHosts(OA_DEFAULT).includes(SITE_TRACKER),
      `${SITE_TRACKER} must not be classified against the container the chain ` +
        `started in, where it holds no state a purge could clear`
    );

    await bounceTrackingProtection.testRunPurgeBounceTrackers();

    todo(
      !SiteDataTestUtils.hasCookies(ORIGIN_TRACKER_BOUND),
      `The purge must reach the state ${SITE_TRACKER} collected in the ` +
        `container it ran in`
    );

    BrowserTestUtils.removeTab(tab);
  });
});

// example.com -> itisatracker.org -> example.org, all in container 1
//
// A site bound to the container its tab is already in needs no switch, so the
// chain must behave exactly as it does without the feature: only the bounce
// tracker is classified, in the tab's container.
add_task(async function test_same_container_association_changes_nothing() {
  await withSiteAssociations([[SITE_B, OTHER_CONTAINER]], async () => {
    assertNoBTPState("Before the bounce");

    let tab = await openTabIn(OTHER_CONTAINER);
    let targetURL = new URL(url(ORIGIN_B));

    let tabCount = gBrowser.tabs.length;
    let loaded = BrowserTestUtils.browserLoaded(
      tab.linkedBrowser,
      false,
      targetURL.href
    );
    await navigateLinkClick(
      tab.linkedBrowser,
      getBounceURL({ bounceType: "server", targetURL })
    );
    await loaded;

    is(gBrowser.tabs.length, tabCount, "The load was not retargeted");

    await endExtendedNavigation(tab.linkedBrowser);

    Assert.deepEqual(
      candidateHosts(OA_OTHER),
      [SITE_TRACKER],
      "Only the bounce tracker is classified, in the tab's container"
    );
    assertNoBTPState("A chain within one container", [OTHER_CONTAINER]);

    BrowserTestUtils.removeTab(tab);
  });
});

// example.com -> itisatracker.org (container 2, new tab) -> example.org
//
// A purge must clear the state a tracker actually collected. A tracker bound to
// a container retargets the chain into it as soon as the load starts, and the
// unbound destination stays there, so the tracker's state lives in that
// container. That is where the tracker must be classified and where the purge
// has to reach.
add_task(async function test_purge_reaches_the_state_in_the_bound_container() {
  await withSiteAssociations([[SITE_TRACKER, BOUND_CONTAINER]], async () => {
    assertNoBTPState("Before the bounce");

    let tab = await openTabIn(0);
    let targetURL = new URL(url(ORIGIN_B));

    let retargeted = await navigateRetargeted(
      tab.linkedBrowser,
      getBounceURL({
        bounceType: "server",
        targetURL,
        setState: "cookie-server",
      }),
      targetURL
    );

    is(
      retargeted.userContextId,
      BOUND_CONTAINER,
      "The chain was retargeted into the container the tracker is bound to"
    );
    ok(
      SiteDataTestUtils.hasCookies(ORIGIN_TRACKER_BOUND),
      "The tracker's hop set its cookie in the container it is bound to"
    );
    ok(
      !SiteDataTestUtils.hasCookies(ORIGIN_TRACKER),
      "The tracker set no cookie in the container the chain started in"
    );

    await endExtendedNavigation(tab.linkedBrowser);
    await endExtendedNavigationByClosing(retargeted);

    todo(
      candidateHosts(OA_BOUND).includes(SITE_TRACKER),
      `${SITE_TRACKER} must be classified in the container its hop ran in`
    );
    todo(
      !candidateHosts(OA_DEFAULT).includes(SITE_TRACKER),
      `${SITE_TRACKER} must not be classified against the container the chain ` +
        `started in, where it holds no state a purge could clear`
    );

    let purged = await bounceTrackingProtection.testRunPurgeBounceTrackers();
    ok(
      purged.includes(SITE_TRACKER),
      `${SITE_TRACKER} must be purged, whichever container it is classified in`
    );
    todo(
      !purged.includes(SITE_B),
      `The destination ${SITE_B} must not be purged: it is where the extended ` +
        `navigation ended, not an intermediate hop`
    );

    todo(
      !SiteDataTestUtils.hasCookies(ORIGIN_TRACKER_BOUND),
      `The purge must reach the state ${SITE_TRACKER} collected in the ` +
        `container its hop ran in`
    );

    BrowserTestUtils.removeTab(tab);
  });
});

// example.com -> example.org (container 2, new tab)
//
// A purge must only clear state for a site which actually bounced. Subframes are
// never retargeted, so a bound site keeps writing partitioned third-party state in
// the container the user browses in, and the purge pattern wildcards partitionKey:
// that state, and any first party state from before the association, must survive
// an ordinary navigation to the site.
add_task(async function test_purge_spares_the_container_navigated_from() {
  await withSiteAssociations([[SITE_B, BOUND_CONTAINER]], async () => {
    assertNoBTPState("Before the navigation");

    // First-party state from before the site was bound to a container.
    SiteDataTestUtils.addToCookies({
      host: SITE_B,
      originAttributes: OA_DEFAULT,
      name: "btp",
      value: "before-the-association",
    });
    // State the site holds as a third party under an unbound top level, which
    // no association can move because subframes are never retargeted.
    SiteDataTestUtils.addToCookies({
      host: SITE_B,
      originAttributes: { ...OA_DEFAULT, partitionKey: `(https,${SITE_A})` },
      name: "btp",
      value: "partitioned",
    });
    ok(
      SiteDataTestUtils.hasCookies(ORIGIN_B, [
        { key: "btp", value: "before-the-association" },
      ]),
      "The site holds first party state in normal browsing"
    );
    ok(
      SiteDataTestUtils.hasCookies(
        ORIGIN_B,
        [{ key: "btp", value: "partitioned" }],
        { ...OA_DEFAULT, partitionKey: `(https,${SITE_A})` }
      ),
      "The site holds partitioned third party state in normal browsing"
    );

    let tab = await openTabIn(0);
    let targetURL = new URL(url(ORIGIN_B));
    let retargeted = await navigateRetargeted(tab.linkedBrowser, targetURL);

    is(
      retargeted.userContextId,
      BOUND_CONTAINER,
      "The navigation landed in the container the site is bound to"
    );

    await endExtendedNavigation(tab.linkedBrowser);

    let purged = await bounceTrackingProtection.testRunPurgeBounceTrackers();
    todo(
      !purged.includes(SITE_B),
      `Navigating to ${SITE_B} must not get it purged`
    );
    todo(
      SiteDataTestUtils.hasCookies(ORIGIN_B, [
        { key: "btp", value: "before-the-association" },
      ]),
      `The first party state ${SITE_B} holds in the container the user ` +
        `navigated from must survive`
    );
    todo(
      SiteDataTestUtils.hasCookies(
        ORIGIN_B,
        [{ key: "btp", value: "partitioned" }],
        { ...OA_DEFAULT, partitionKey: `(https,${SITE_A})` }
      ),
      `The partitioned third party state ${SITE_B} holds in that container, ` +
        `which no association moves, must survive`
    );
    todo(
      !bounceTrackingProtection.hasRecentlyPurgedSite(SITE_B),
      `${SITE_B} must not be reported as recently purged, which is the flag ` +
        `Report Broken Site sends for the site`
    );

    BrowserTestUtils.removeTab(retargeted);
    BrowserTestUtils.removeTab(tab);
  });
});

// example.com -> example.org (container 2, new tab, open across the purge)
//
// A site the user has open at the top level must be left alone by the purge, which
// recognises it through the BounceTrackingStates of open tabs. A tab the load was
// retargeted into is such a tab and has to be recognised as one.
add_task(async function test_purge_spares_a_site_open_in_a_retargeted_tab() {
  await withSiteAssociations([[SITE_B, BOUND_CONTAINER]], async () => {
    assertNoBTPState("Before the navigation");

    SiteDataTestUtils.addToCookies({
      host: SITE_B,
      originAttributes: OA_BOUND,
      name: "btp",
      value: "open-tab",
    });
    ok(
      SiteDataTestUtils.hasCookies(originIn(ORIGIN_B, OA_BOUND), [
        { key: "btp", value: "open-tab" },
      ]),
      "The site holds state in the container it is bound to"
    );
    // A candidate an earlier bounce inside the bound container would have left.
    bounceTrackingProtection.testAddBounceTrackerCandidate(
      OA_BOUND,
      SITE_B,
      Date.now() * 1000
    );

    let tab = await openTabIn(0);
    let retargeted = await navigateRetargeted(
      tab.linkedBrowser,
      new URL(url(ORIGIN_B))
    );

    is(
      retargeted.userContextId,
      BOUND_CONTAINER,
      "The site is the document of a tab in the container it is bound to"
    );
    ok(retargeted.selected, "and that tab is the one the user is looking at");

    let purged = await bounceTrackingProtection.testRunPurgeBounceTrackers();

    todo(
      !purged.includes(SITE_B),
      `${SITE_B} must not be purged while it is open at the top level`
    );
    todo(
      SiteDataTestUtils.hasCookies(originIn(ORIGIN_B, OA_BOUND), [
        { key: "btp", value: "open-tab" },
      ]),
      `The state of a site the user has open must survive the purge`
    );

    BrowserTestUtils.removeTab(retargeted);
    BrowserTestUtils.removeTab(tab);
  });
});

// example.com -> test1.example.org (container 2, new tab)
//
// Associations are per host while BTP classifies and purges whole schemeless
// sites. Binding one host must not put its eTLD+1 on the candidate list, so the
// registrable domain, which is bound to no container, must keep its data.
add_task(async function test_host_association_spares_the_rest_of_the_site() {
  await withSiteAssociations([[SITE_SUB_B, BOUND_CONTAINER]], async () => {
    assertNoBTPState("Before the navigation");

    SiteDataTestUtils.addToCookies({
      host: SITE_B,
      originAttributes: OA_DEFAULT,
      name: "btp",
      value: "sibling-host",
    });
    ok(
      SiteDataTestUtils.hasCookies(ORIGIN_B, [
        { key: "btp", value: "sibling-host" },
      ]),
      `${SITE_B}, bound to no container, holds state in normal browsing`
    );

    let tab = await openTabIn(0);
    let targetURL = new URL(url(ORIGIN_SUB_B));
    let retargeted = await navigateRetargeted(tab.linkedBrowser, targetURL);

    is(
      retargeted.userContextId,
      BOUND_CONTAINER,
      "The bound host landed in the container it is bound to"
    );

    await endExtendedNavigation(tab.linkedBrowser);

    todo(
      !candidateHosts(OA_DEFAULT).includes(SITE_B),
      `Binding ${SITE_SUB_B} must not classify ${SITE_B}`
    );

    await bounceTrackingProtection.testRunPurgeBounceTrackers();

    todo(
      SiteDataTestUtils.hasCookies(ORIGIN_B, [
        { key: "btp", value: "sibling-host" },
      ]),
      `The state of ${SITE_B}, which is bound to no container, must survive`
    );

    BrowserTestUtils.removeTab(retargeted);
    BrowserTestUtils.removeTab(tab);
  });
});

// example.com -> itisatracker.org -> example.org, all in container 0 (pref off)
//
// With the feature off an association must have no effect at all: the destination
// commits in the tab it was loaded from, so only the bounce tracker is classified
// and the bound container stays empty.
add_task(async function test_feature_disabled_changes_nothing() {
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.containers.switchDuringNavigation.enabled", false]],
  });
  try {
    await withSiteAssociations([[SITE_B, BOUND_CONTAINER]], async () => {
      assertNoBTPState("Before the bounce");

      let tab = await openTabIn(0);
      let targetURL = new URL(url(ORIGIN_B));

      let tabCount = gBrowser.tabs.length;
      let loaded = BrowserTestUtils.browserLoaded(
        tab.linkedBrowser,
        false,
        targetURL.href
      );
      await navigateLinkClick(
        tab.linkedBrowser,
        getBounceURL({ bounceType: "server", targetURL })
      );
      await loaded;

      is(gBrowser.tabs.length, tabCount, "The load was not retargeted");

      await endExtendedNavigation(tab.linkedBrowser);

      Assert.deepEqual(
        candidateHosts(OA_DEFAULT),
        [SITE_TRACKER],
        "Only the bounce tracker is classified"
      );
      assertNoBTPState("With the feature off", [0]);

      BrowserTestUtils.removeTab(tab);
    });
  } finally {
    await SpecialPowers.popPrefEnv();
  }
});
