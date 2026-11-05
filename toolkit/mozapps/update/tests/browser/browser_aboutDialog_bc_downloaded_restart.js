/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Replaces Services.startup in the About Dialog with one whose quit only
// records its mode and sets attemptingQuit, as a quit that goes ahead does.
// Returns the recorded modes.
function stubQuit(aboutDialog) {
  let quitModes = [];
  let attemptingQuit = false;
  let startup = new Proxy(
    {},
    {
      get(target, prop) {
        if (prop == "quit") {
          return mode => {
            quitModes.push(mode);
            attemptingQuit = true;
          };
        }
        if (prop == "attemptingQuit") {
          return attemptingQuit;
        }
        let value = Services.startup[prop];
        return typeof value == "function"
          ? value.bind(Services.startup)
          : value;
      },
    }
  );
  aboutDialog.Services = new Proxy(
    {},
    {
      get(target, prop) {
        return prop == "startup" ? startup : Services[prop];
      },
    }
  );
  return quitModes;
}

// Test for About Dialog background check for updates with the update
// downloaded, where clicking "Restart to Update" starts the restart.
add_task(async function aboutDialog_backgroundCheck_downloaded_restart() {
  let quitModes;
  let params = { backgroundUpdate: true, waitForUpdateState: STATE_PENDING };
  await runAboutDialogUpdateTest(params, [
    async function installQuitStub(aboutDialog) {
      quitModes = stubQuit(aboutDialog);
    },
    {
      panelId: "apply",
      checkActiveUpdate: { state: STATE_PENDING },
      continueFile: null,
      forceApply: true,
    },
    async function checkPanelAfterQuit(aboutDialog) {
      Assert.deepEqual(
        quitModes,
        [Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart],
        "Restart to Update should call quit once to restart"
      );
      is(
        aboutDialog.gAppUpdater.selectedPanel.id,
        "restarting",
        "The restarting panel should still be displayed"
      );
    },
  ]);
});
