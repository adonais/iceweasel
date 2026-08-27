/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { getSkillPrompt } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/PromptLoader.sys.mjs"
);

const { getRemoteClient } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Utils.sys.mjs"
);

add_task(async function test_getSkillPrompt_fetches_all_real_generic_skills() {
  const records = await getRemoteClient().get();
  const gGenericSkillNames = records
    .filter(record => record.kind === "skill" && record.model === "generic")
    .map(record => record.name)
    .sort((a, b) => a.localeCompare(b));

  for (const skillName of gGenericSkillNames) {
    const prompt = await getSkillPrompt(skillName, "generic");
    Assert.equal(typeof prompt, "string", `${skillName} has prompt text`);
    Assert.ok(prompt.length, `${skillName} prompt is not empty`);
  }
});

add_task(async function test_getSkillPrompt_falls_back_to_generic_model() {
  const genericPrompt = await getSkillPrompt("kit", "generic");
  const modelPrompt = await getSkillPrompt("kit", "made-up-model");

  Assert.equal(
    modelPrompt,
    genericPrompt,
    "A model without a skill override uses the generic skill"
  );
});

add_task(async function test_getSkillPrompt_returns_error_on_unknown_skill() {
  const result = await getSkillPrompt("nonexistent", "generic");

  Assert.deepEqual(result, { error: "Unknown skill: nonexistent" });
});

add_task(async function test_getSkillPrompt_returns_error_on_invalid_name() {
  Assert.deepEqual(await getSkillPrompt("../etc/passwd", "generic"), {
    error: "Invalid skill name: ../etc/passwd",
  });
  Assert.deepEqual(await getSkillPrompt("", "generic"), {
    error: "Invalid skill name: ",
  });
  Assert.deepEqual(await getSkillPrompt("name with spaces", "generic"), {
    error: "Invalid skill name: name with spaces",
  });
});
