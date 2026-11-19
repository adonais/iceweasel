/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const SHOW_COMMENTS_PREF = "devtools.markup.showComments";

add_task(async function test_setting_reloads_page() {
  await pushPref(SHOW_COMMENTS_PREF, true);
  const { toolbox, root } = await openSettings();
  const checkbox = root.shadowRoot.querySelector(
    "#settings-inspector-show-comments"
  );
  await checkbox.closest("devtools-settings-pref").updateComplete;
  await checkbox.updateComplete;

  const { onDomCompleteResource } =
    await waitForNextTopLevelDomCompleteResource(toolbox.commands);
  checkbox.click();
  is(
    Services.prefs.getBoolPref(SHOW_COMMENTS_PREF),
    false,
    "Clicking the setting writes its pref"
  );
  await onDomCompleteResource;
  ok(true, "Clicking the setting reloads the page");

  await toolbox.destroy();
});
