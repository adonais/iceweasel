/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Provide infrastructure for JSWindowActor tests.
 */

const URL = "about:blank";
const TEST_URL = "http://test2.example.org/";
let windowActorOptions = {
  parent: {
    esModuleURI: "resource://testing-common/TestWindowParent.sys.mjs",
  },
  child: {
    esModuleURI: "resource://testing-common/TestWindowChild.sys.mjs",
  },
};

function declTest(name, cfg) {
  let {
    url = "about:blank",
    allFrames = false,
    includeChrome = false,
    matches,
    remoteTypes,
    safeForUntrustedWebProcess = true,
    safeForUntrustedWebProcessPref = undefined,
    messageManagerGroups,
    events,
    observers,
    test,
  } = cfg;

  // Build the actor options object which will be used to register & unregister
  // our window actor.
  let actorOptions = {
    parent: { ...windowActorOptions.parent },
    child: { ...windowActorOptions.child, events, observers },
  };
  actorOptions.allFrames = allFrames;
  actorOptions.includeChrome = includeChrome;
  if (matches !== undefined) {
    actorOptions.matches = matches;
  }
  if (remoteTypes !== undefined) {
    actorOptions.remoteTypes = remoteTypes;
  }
  actorOptions.safeForUntrustedWebProcess = safeForUntrustedWebProcess;
  if (messageManagerGroups !== undefined) {
    actorOptions.messageManagerGroups = messageManagerGroups;
  }

  // Add a new task for the actor test declared here.
  add_task(async function () {
    info("Entering test: " + name);

    if (safeForUntrustedWebProcessPref !== undefined) {
      await SpecialPowers.pushPrefEnv({
        set: [
          [
            "dom.jsipc.check_safeForUntrustedWebProcess",
            safeForUntrustedWebProcessPref,
          ],
        ],
      });
    }

    // Register our actor, and load a new tab with the relevant URL
    ChromeUtils.registerWindowActor("TestWindow", actorOptions);
    try {
      await BrowserTestUtils.withNewTab(url, async browser => {
        info("browser ready");
        await Promise.resolve(test(browser, window));
      });
    } finally {
      // Unregister the actor after the test is complete.
      ChromeUtils.unregisterWindowActor("TestWindow");
      info("Exiting test: " + name);
    }
  });
}
