/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function () {
  await pushPref("devtools.settings.redesign-enabled", true);
  const tab = await addTab("about:blank");
  const toolbox = await openToolboxForTab(tab, "options");
  const doc = toolbox.doc.getElementById(
    "toolbox-panel-iframe-options"
  ).contentDocument;
  is(
    doc.documentURI,
    "chrome://devtools/content/settings/index.html",
    "Enabling the redesign loads the new Settings document"
  );
  await toolbox.destroy();
});
