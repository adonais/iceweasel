/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Ensure target is closed if client is closed directly
add_task(async function () {
  // We use a commands object for the main process
  await pushPref("devtools.chrome.enabled", true);

  await new Promise(resolve => {
    getParentProcessActors((client, target) => {
      target.on("target-destroyed", () => {
        ok(true, "Target was destroyed");
        resolve();
      });
      client.close();
    });
  });
});
