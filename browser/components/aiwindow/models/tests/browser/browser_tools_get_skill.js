/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { GET_SKILL, TOOLS, toolFns } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);

add_task(function test_GET_SKILL_constant_in_TOOLS_array() {
  Assert.equal(GET_SKILL, "get_skill");
  Assert.ok(TOOLS.includes(GET_SKILL));
});

add_task(function test_toolFns_has_getSkill() {
  Assert.equal(typeof toolFns.getSkill, "function");
});

add_task(async function test_getSkill_returns_prompt_text() {
  const result = await toolFns.getSkill({
    toolParams: { name: "kit" },
    model: "generic",
  });

  Assert.equal(typeof result, "string", "The skill has prompt text");
  Assert.ok(result.length, "The skill prompt is not empty");
});

add_task(async function test_getSkill_returns_error_on_unknown() {
  const result = await toolFns.getSkill({
    toolParams: { name: "nonexistent" },
    model: "generic",
  });

  Assert.deepEqual(result, { error: "Unknown skill: nonexistent" });
});
