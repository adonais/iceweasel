/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { buildModalConfig } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/FeedbackModal.sys.mjs"
);

add_task(function test_thumbs_up_has_no_multiselect() {
  const config = buildModalConfig("thumbs-up");
  const tiles = config.content.screens[0].content.tiles;
  const hasMultiselect = tiles.some(t => t.type === "multiselect");
  Assert.ok(!hasMultiselect, "thumbs-up modal should not include multiselect");
});

add_task(function test_thumbs_down_has_multiselect() {
  const config = buildModalConfig("thumbs-down");
  const tiles = config.content.screens[0].content.tiles;
  const multiselect = tiles.find(t => t.type === "multiselect");
  Assert.ok(multiselect, "thumbs-down modal should include multiselect");
});

add_task(function test_thumbs_down_reasons_use_string_ids() {
  const config = buildModalConfig("thumbs-down");
  const tiles = config.content.screens[0].content.tiles;
  const multiselect = tiles.find(t => t.type === "multiselect");
  Assert.ok(
    multiselect.data.every(r => r.label?.string_id),
    "all reason labels should use string_id for localization"
  );
});

add_task(function test_both_variants_have_textarea() {
  for (const type of ["thumbs-up", "thumbs-down"]) {
    const config = buildModalConfig(type);
    const tiles = config.content.screens[0].content.tiles;
    Assert.ok(
      tiles.some(t => t.type === "textarea"),
      `${type} modal should include a textarea`
    );
  }
});

add_task(function test_learn_more_action_defined() {
  for (const type of ["thumbs-up", "thumbs-down"]) {
    const config = buildModalConfig(type);
    Assert.ok(
      config.content.screens[0].content["learn-more"]?.action,
      `${type} modal should define a learn_more action`
    );
  }
});
