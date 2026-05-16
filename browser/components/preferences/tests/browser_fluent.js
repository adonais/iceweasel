function whenMainPaneLoadedFinished() {
  return new Promise(function (resolve) {
    const topic = "main-pane-loaded";
    Services.obs.addObserver(function observer() {
      Services.obs.removeObserver(observer, topic);
      resolve();
    }, topic);
  });
}

// Temporary test for an experimental new localization API.
// See bug 1402069 for details.
add_task(async function () {
  // The string is used only when `browserTabsRemoteAutostart` is true
  if (!Services.appinfo.browserTabsRemoteAutostart) {
    ok(true, "fake test to avoid harness complaining");
    return;
  }

  await Promise.all([
    openPreferencesViaOpenPreferencesAPI("general", { leaveOpen: true }),
    whenMainPaneLoadedFinished(),
  ]);

  let doc = gBrowser.contentDocument;
  await doc.l10n.ready;

  let [msg] = await doc.l10n.formatMessages([{ id: "pane-general-title" }]);

  ok(msg.value, "pane-general-title message has a value");
  Assert.equal(msg.attributes, null, "pane-general-title has no attributes");

  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});
