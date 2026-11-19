/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const TAB_SIZE_PREF = "devtools.editor.tabsize";

add_task(test_tab_size_select);

async function test_tab_size_select() {
  await pushPref(TAB_SIZE_PREF, 4);
  const { toolbox, root } = await openSettings();
  const select = await getSelect(root, "#settings-editor-tab-size");
  is(select.value, "4", "The select reads the tab size pref");

  await chooseOption(select, "8");
  is(
    Services.prefs.getPrefType(TAB_SIZE_PREF),
    Services.prefs.PREF_INT,
    "The tab size pref stays an integer"
  );
  is(
    Services.prefs.getIntPref(TAB_SIZE_PREF),
    8,
    "Changing the select writes the tab size pref"
  );

  await toolbox.destroy();
}
