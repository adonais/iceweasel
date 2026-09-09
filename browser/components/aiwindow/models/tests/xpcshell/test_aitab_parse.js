/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AITab } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/aitab/AITab.sys.mjs"
);
const { parsePageConfig } = AITab;

const PAGE = { header: { type: "header", title: "Hi" }, blocks: [] };
const JSON_TEXT = JSON.stringify(PAGE);

add_task(function test_parsePageConfig_shapes() {
  for (const [name, text] of [
    ["bare JSON", JSON_TEXT],
    ["fenced JSON", `\`\`\`json\n${JSON_TEXT}\n\`\`\``],
    ["fence without a language tag", `\`\`\`\n${JSON_TEXT}\n\`\`\``],
    ["unfenced prose", `Here is the page: ${JSON_TEXT} — let me know!`],
    // The {...} span covers the cases above; braces in the prose around a
    // fenced block defeat it and fall back to unwrapping the fence.
    [
      "braces in prose before a fence",
      `Use {curly}:\n\`\`\`json\n${JSON_TEXT}\n\`\`\``,
    ],
    [
      "braces in prose after a fence",
      `\`\`\`json\n${JSON_TEXT}\n\`\`\`\nThe {x} field.`,
    ],
  ]) {
    Assert.deepEqual(parsePageConfig(text), PAGE, `parses ${name}`);
  }
});

add_task(function test_parsePageConfig_rejects_non_json() {
  Assert.equal(parsePageConfig("no JSON here"), null, "text without an object");
  Assert.equal(parsePageConfig("{ not json }"), null, "malformed object");
});
