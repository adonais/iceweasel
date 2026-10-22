/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const backgroundTaskDefaultAgent = ChromeUtils.importESModule(
  "resource://gre/modules/backgroundtasks/BackgroundTask_defaultagent.sys.mjs"
);

function createMockDefaultAgent(mockData) {
  const sentPings = [];
  return {
    secondsSinceLastAppRun: () => mockData.secondsSinceAppRun,
    getDefaultBrowser: () => mockData.defaultBrowser,
    getReplacePreviousDefaultBrowser: () => mockData.previousDefaultBrowser,
    getDefaultPdfHandler: () => mockData.defaultPdfHandler,
    sendPing: (
      defaultBrowser,
      previousDefaultBrowser,
      defaultPdfHandler,
      shown,
      action,
      daysSinceLastAppLaunch,
      isTaskbarPinned
    ) => {
      sentPings.push({
        defaultBrowser,
        previousDefaultBrowser,
        defaultPdfHandler,
        shown,
        action,
        daysSinceLastAppLaunch,
        isTaskbarPinned,
      });
    },
    getSentPings: () => sentPings,
  };
}

add_task(async function testDoTask() {
  const mockData = {
    secondsSinceAppRun: 604800,
    defaultBrowser: "browser 1",
    previousDefaultBrowser: "browser 2",
    defaultPdfHandler: "pdf handler 1",
  };
  const mockDefaultAgent = createMockDefaultAgent(mockData);
  await backgroundTaskDefaultAgent.doTask(mockDefaultAgent, false);
  const sentPings = mockDefaultAgent.getSentPings();
  Assert.equal(1, sentPings.length);
  Assert.equal(sentPings[0].defaultBrowser, mockData.defaultBrowser);
  Assert.equal(
    sentPings[0].previousDefaultBrowser,
    mockData.previousDefaultBrowser
  );
  Assert.equal(sentPings[0].defaultPdfHandler, mockData.defaultPdfHandler);
  Assert.equal(sentPings[0].shown, "not-shown");
  Assert.equal(sentPings[0].action, "no-action");
  Assert.equal(sentPings[0].daysSinceLastAppLaunch, 7);
  Assert.equal(sentPings[0].isTaskbarPinned, "Error");
});

add_task(async function testDoTaskAppNotRunRecently() {
  const mockData = {
    secondsSinceAppRun: 91 * 24 * 60 * 60,
    defaultBrowser: "browser 1",
    previousDefaultBrowser: "browser 2",
    defaultPdfHandler: "pdf handler 1",
  };
  const mockDefaultAgent = createMockDefaultAgent(mockData);
  await Assert.rejects(
    backgroundTaskDefaultAgent.doTask(mockDefaultAgent, false),
    /App hasn't run recently/
  );
  Assert.equal(0, mockDefaultAgent.getSentPings().length);
});
