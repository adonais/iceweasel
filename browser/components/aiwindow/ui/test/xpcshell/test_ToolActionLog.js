/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const { getActionLogConfigForTool } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/ToolActionLog.sys.mjs"
);

const { GET_OPEN_TABS, SEARCH_BROWSING_HISTORY, GET_USER_MEMORIES } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
  );

add_task(function test_getActionLogConfigForTool_visible_tools() {
  Assert.withSoftAssertions(function (soft) {
    for (const toolName of [
      GET_OPEN_TABS,
      SEARCH_BROWSING_HISTORY,
      GET_USER_MEMORIES,
    ]) {
      const cfg = getActionLogConfigForTool(toolName);
      soft.strictEqual(
        cfg.show,
        true,
        `${toolName} should be visible in the action log`
      );
      soft.equal(
        typeof cfg.label,
        "string",
        `${toolName} action-log label should be a string`
      );
      soft.greater(
        cfg.label.length,
        0,
        `${toolName} action-log label should not be empty`
      );

      soft.notEqual(
        cfg.label,
        toolName,
        `${toolName} label should be readable, not the tool identifier`
      );
    }
  });
});

add_task(function test_getActionLogConfigForTool_unknown_tool_suppressed() {
  const cfg = getActionLogConfigForTool("not_a_real_tool");
  Assert.strictEqual(
    cfg.show,
    false,
    "Unknown tool should default to show: false"
  );
});

add_task(function test_getActionLogConfigForTool_returns_well_formed_default() {
  const cfg = getActionLogConfigForTool("not_a_real_tool");
  Assert.equal(typeof cfg, "object", "Returns an object");
  Assert.equal(typeof cfg.show, "boolean", "show is a boolean");
  Assert.equal(typeof cfg.label, "string", "label is a string");
});
