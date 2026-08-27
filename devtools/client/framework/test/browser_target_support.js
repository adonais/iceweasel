/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Test support methods on Target, such as `hasActor` and `getTrait`.

async function testTarget(client, target) {
  is(
    target.hasActor("inspector"),
    true,
    "target.hasActor() true when actor exists."
  );
  is(
    target.hasActor("notreal"),
    false,
    "target.hasActor() false when actor does not exist."
  );

  is(
    target.getTrait("giddyup"),
    undefined,
    "target.getTrait() returns undefined when trait does not exist"
  );
}

// Ensure target is closed if client is closed directly
add_task(async function test() {
  // We use a commands object for the main process
  await pushPref("devtools.chrome.enabled", true);

  await new Promise(resolve => {
    getParentProcessActors((client, target) => {
      testTarget(client, target);
      target.on("target-destroyed", () => {
        ok(true, "Target was destroyed");
        resolve();
      });
      client.close();
    });
  });
});
