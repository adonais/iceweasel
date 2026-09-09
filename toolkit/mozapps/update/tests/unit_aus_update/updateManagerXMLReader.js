add_task(async function testOutcomeTelemetry() {
  setupTestCommon();
  let patchProps1 = {
    type: "partial",
    url: "http://partial/",
    size: "86",
    selected: "true",
    state: STATE_PENDING,
    custom1: 'custom1_attr="custom1 patch value"',
    custom2: 'custom2_attr="custom2 patch value"',
  };
  let patches1 = getLocalPatchString(patchProps1);
  let updateProps1 = {
    type: "major",
    name: "New",
    displayVersion: "version 4",
    appVersion: "4.0",
    platformVersion: "4.0",
    buildID: "20070811053724",
    detailsURL: "http://details1/",
    serviceURL: "http://service1/",
    installDate: "1238441300314",
    statusText: "test status text",
    isCompleteUpdate: "false",
    channel: "test_channel",
    foregroundDownload: "true",
    promptWaitTime: "345600",
    previousAppVersion: "3.0",
    custom1: 'custom1_attr="custom1 value"',
    custom2: 'custom2_attr="custom2 value"',
  };
  let updates1 = getLocalUpdateString(updateProps1, patches1);
  writeUpdatesToXMLFile(getLocalUpdatesXMLString(updates1), true);
  let patchProps2 = {
    type: "complete",
    url: "http://complete/",
    size: "75",
    selected: "true",
    state: STATE_FAILED,
    custom1: 'custom3_attr="custom3 patch value"',
    custom2: 'custom4_attr="custom4 patch value"',
  };
  let patches2 = getLocalPatchString(patchProps2);
  let updateProps2 = {
    type: "minor",
    name: "Existing",
    appVersion: "3.0",
    platformVersion: "3.0",
    detailsURL: "http://details2/",
    serviceURL: "http://service2/",
    statusText: getString("patchApplyFailure"),
    isCompleteUpdate: "true",
    channel: "test_channel",
    foregroundDownload: "false",
    promptWaitTime: "691200",
    custom1: 'custom3_attr="custom3 value"',
    custom2: 'custom4_attr="custom4 value"',
  };
  let updates2 = getLocalUpdateString(updateProps2, patches2);
  writeUpdatesToXMLFile(getLocalUpdatesXMLString(updates2), false);

  await standardInit();

  const parsedUpdatesXml = await gUpdateManager.getHistory();
  Assert.ok(parsedUpdatesXml);
  const summarizedLatestUpdate =
    UpdateUtils.summarizeLatestUpdate(parsedUpdatesXml);
  Assert.ok(summarizedLatestUpdate);
  Assert.equal("4.0", summarizedLatestUpdate.target_version);
  Assert.equal("3.0", summarizedLatestUpdate.previous_version);
  Assert.equal(true, summarizedLatestUpdate.is_patch);
  Assert.equal(0, summarizedLatestUpdate.total_retries);

  await doTestFinish();
});
