/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Check expanding/collapsing local and session storage in the console.
const TEST_URI =
  "http://example.com/browser/devtools/client/webconsole/" +
  "test/browser/test-local-session-storage.html";

add_task(async function () {
  const hud = await openNewTabAndConsole(TEST_URI);
  const messages = await logMessages(hud);
  const objectInspectors = messages.map(node => node.querySelector(".tree"));

  is(
    objectInspectors.length,
    2,
    "There is the expected number of object inspectors"
  );

  await checkValues(objectInspectors[0], "localStorage");
  await checkValues(objectInspectors[1], "sessionStorage");
});

async function logMessages(hud) {
  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], () => {
    content.console.log("localStorage", content.localStorage);
  });
  const localStorageMsg = await waitFor(() =>
    findConsoleAPIMessage(hud, "localStorage")
  );

  await SpecialPowers.spawn(gBrowser.selectedBrowser, [], () => {
    content.console.log("sessionStorage", content.sessionStorage);
  });
  const sessionStorageMsg = await waitFor(() =>
    findConsoleAPIMessage(hud, "sessionStorage")
  );

  return [localStorageMsg, sessionStorageMsg];
}

async function checkValues(oi, storageType) {
  info(`Expanding the ${storageType} object`);
  await expandObjectInspectorNode(oi.querySelector(".tree-node"));

  let nodes = oi.querySelectorAll(".tree-node");
  // There are 4 nodes: the root, size, entries and the proto.
  is(nodes.length, 5, "There is the expected number of nodes in the tree");

  info("Expanding the <entries> leaf of the map");
  const entriesNode = nodes[3];
  is(
    entriesNode.querySelector(".node").textContent,
    "<entries>",
    "There is the expected <entries> node"
  );
  await expandObjectInspectorNode(entriesNode);

  nodes = oi.querySelectorAll(".node");
  // There are now 7 nodes, the 5 original ones, and the 2 entries.
  is(nodes.length, 7, "There is the expected number of nodes in the tree");

  const title = nodes[0].querySelector(".objectTitle").textContent;
  const name1 = nodes[1].querySelector(".object-label").textContent;
  const value1 = nodes[1].querySelector(".objectBox").textContent;

  const length = [...nodes[2].querySelectorAll(".object-label,.objectBox")].map(
    node => node.textContent
  );

  // The iteration order of storage entries follows the underlying hashtable
  // order, which isn't guaranteed (see bug 2048926), so don't assume which of
  // "key"/"key2" comes first.
  const expectedValues =
    storageType === "localStorage"
      ? { key: `"value1"`, key2: `"value2"` }
      : { key: `"value3"`, key2: `"value4"` };

  // nodes[4] and nodes[5] are the two entries; collect them as index -> [key, value].
  const entries = [4, 5].map(index =>
    [
      ...nodes[index].querySelectorAll(
        ".object-label,.nodeName,.objectBox-string"
      ),
    ].map(node => node.textContent)
  );

  is(title, "Storage", `${storageType} object has the expected title`);
  is(length[0], "length", `${storageType} length property name is correct`);
  is(length[1], "2", `${storageType} length property value is correct`);

  entries.forEach(([entryIndex, entryKey, entryValue], i) => {
    is(
      entryIndex,
      String(i),
      `entry #${i} of ${storageType} has the correct index`
    );
    ok(
      entryKey in expectedValues,
      `entry #${i} of ${storageType} has a known key (got "${entryKey}")`
    );
    is(
      entryValue,
      expectedValues[entryKey],
      `entry #${i} of ${storageType} has the correct value`
    );
  });

  const entryKeys = entries.map(([, entryKey]) => entryKey);
  Assert.deepEqual(
    [...entryKeys].sort(),
    ["key", "key2"],
    `${storageType} has the expected set of keys`
  );

  // The inline short descriptor shows one of the entries; its ordering is
  // independent from the <entries> list above, so just check it is consistent.
  ok(
    name1 in expectedValues,
    `Name of short descriptor is a known key (got "${name1}")`
  );
  is(value1, expectedValues[name1], "Value of short descriptor is correct");
}
