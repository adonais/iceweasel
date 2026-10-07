const TEST_URL =
  "https://example.com/browser/toolkit/components/messaging-system/schemas/TriggerActionSchemas/test/browser/index.md";

const { ASRouterTriggerListeners } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/ASRouterTriggerListeners.sys.mjs"
);

function getHeadingsFromDocs(docs) {
  const re = /### `(\w+)`/g;
  const found = [];
  let match = 1;
  while (match) {
    match = re.exec(docs);
    if (match) {
      found.push(match[1]);
    }
  }
  return found;
}

add_task(async function test_trigger_docs() {
  let request = await fetch(TEST_URL, { credentials: "omit" });
  let docs = await request.text();
  let headings = getHeadingsFromDocs(docs);
  for (let triggerName of ASRouterTriggerListeners.keys()) {
    Assert.ok(
      headings.includes(triggerName),
      `${triggerName} not found in TriggerActionSchemas/index.md`
    );
  }
});
