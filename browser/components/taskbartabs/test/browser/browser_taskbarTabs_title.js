/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */
"use strict";

ChromeUtils.defineESModuleGetters(this, {
  TaskbarTabs: "resource:///modules/taskbartabs/TaskbarTabs.sys.mjs",
  TaskbarTabsPin: "resource:///modules/taskbartabs/TaskbarTabsPin.sys.mjs",
  sinon: "resource://testing-common/Sinon.sys.mjs",
});

const kUserContextLabel = "(User Context Label)";
let gProfileName = null;

const kUri = Services.io.newURI("https://example.com");

sinon.stub(TaskbarTabsPin, "pinTaskbarTab");
sinon.stub(TaskbarTabsPin, "unpinTaskbarTab");

add_setup(function setup() {
  sinon
    .stub(ContextualIdentityService, "getUserContextLabel")
    .callsFake(index => {
      return index === 0 ? "" : kUserContextLabel;
    });
  sinon
    .stub(SelectableProfileService, "isEnabled")
    .get(() => gProfileName !== null);
  sinon.stub(SelectableProfileService, "currentProfile").get(() => ({
    name: gProfileName,
  }));
});

registerCleanupFunction(async function cleanup() {
  sinon.restore();
  await TaskbarTabs.resetForTests();
});

async function monitorTitleUntilLoaded(win) {
  let finished = false;
  const promise = TestUtils.topicObserved(
    "document-title-changed",
    aSubject => {
      if (aSubject == win.document) {
        // Check that every title looks reasonable
        checkTitleLooksReasonable(win.document.title);
        return finished;
      }

      return false;
    }
  );

  await BrowserTestUtils.firstBrowserLoaded(win).then(() => {
    finished = true;

    // Send a spurious notification to get things going.
    Services.obs.notifyObservers(win.document, "document-title-changed");
  });

  await promise;
}

function checkTitleLooksReasonable(aTitle) {
  return [
    /—[^ ]/, // needs space after em dash
    /(^|[^ ])—/, // needs space before em dash
    /[^ ]\(/, // needs space before em dash
    /\)[^ ]/, // needs space after parenthesis
    /—[^ ]?—/, // can't have adjacent em dashes
    /^\s*—/, // can't start with an em dash
  ].forEach(regex => {
    is(aTitle.match(regex), null, `Title '${aTitle}' shouldn't match ${regex}`);
  });
}

async function test_defaultCase() {
  gProfileName = null;

  const tt = await TaskbarTabs.findOrCreateTaskbarTab(kUri, 0);
  const win = await TaskbarTabs.openWindow(tt);
  await monitorTitleUntilLoaded(win);

  const title = win.document.title;
  ok(!title.includes(kUserContextLabel), "Title has no container name");
  await TaskbarTabs.removeTaskbarTab(tt.id);
  await BrowserTestUtils.closeWindow(win);
}

async function test_container(aMode) {
  gProfileName = null;

  const tt = await TaskbarTabs.findOrCreateTaskbarTab(kUri, 1);
  const win = await TaskbarTabs.openWindow(tt);
  await monitorTitleUntilLoaded(win);

  const title = win.document.title;
  is(
    title.includes(kUserContextLabel),
    aMode !== "privacy",
    "Container is missing if browser.exposeContentTitleInWindow is on and present if it is off"
  );
  await TaskbarTabs.removeTaskbarTab(tt.id);
  await BrowserTestUtils.closeWindow(win);
}

async function test_profile() {
  gProfileName = "(Profile Name)";

  const tt = await TaskbarTabs.findOrCreateTaskbarTab(kUri, 0);
  const win = await TaskbarTabs.openWindow(tt);
  await monitorTitleUntilLoaded(win);

  const title = win.document.title;
  ok(!title.includes(kUserContextLabel), "Title has no container name");
  ok(title.includes(gProfileName), "Title contains the profile's name");
  await TaskbarTabs.removeTaskbarTab(tt.id);
  await BrowserTestUtils.closeWindow(win);
}

async function test_profileAndContainer(aMode) {
  gProfileName = "(Profile Name)";

  const tt = await TaskbarTabs.findOrCreateTaskbarTab(kUri, 1);
  const win = await TaskbarTabs.openWindow(tt);
  await monitorTitleUntilLoaded(win);

  const title = win.document.title;
  is(
    title.includes(kUserContextLabel),
    aMode !== "privacy",
    "Container is missing if browser.exposeContentTitleInWindow is on and present if it is off"
  );
  ok(title.includes(gProfileName), "Title contains the profile's name");
  await TaskbarTabs.removeTaskbarTab(tt.id);
  await BrowserTestUtils.closeWindow(win);
}

async function withoutExposingTitle(aTestCase) {
  await SpecialPowers.pushPrefEnv({
    set: [["privacy.exposeContentTitleInWindow", false]],
  });

  try {
    await aTestCase("privacy");
  } finally {
    await SpecialPowers.popPrefEnv();
  }
}

add_task(test_defaultCase);
add_task(test_container);
add_task(test_profile);
add_task(test_profileAndContainer);

add_task(async function test_defaultCase_privacy() {
  return withoutExposingTitle(test_defaultCase);
});

add_task(async function test_container_privacy() {
  return withoutExposingTitle(test_container);
});

add_task(async function test_profile_privacy() {
  return withoutExposingTitle(test_profile);
});

add_task(async function test_profileAndContainer_privacy() {
  return withoutExposingTitle(test_profileAndContainer);
});
