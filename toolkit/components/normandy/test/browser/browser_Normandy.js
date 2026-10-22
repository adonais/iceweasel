"use strict";

const { TelemetryUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/TelemetryUtils.sys.mjs"
);
const { Normandy } = ChromeUtils.importESModule(
  "resource://normandy/Normandy.sys.mjs"
);
const { RecipeRunner } = ChromeUtils.importESModule(
  "resource://normandy/lib/RecipeRunner.sys.mjs"
);

decorate_task(
  withStub(Normandy, "finishInit"),
  async function testStartupDelayed({ finishInitStub }) {
    let originalDeferred = Normandy.uiAvailableNotificationObserved;
    let mockUiAvailableDeferred = Promise.withResolvers();
    Normandy.uiAvailableNotificationObserved = mockUiAvailableDeferred;

    let initPromise = Normandy.init();
    await null;

    ok(
      !finishInitStub.called,
      "When initialized, do not call finishInit immediately."
    );

    Normandy.observe(null, "sessionstore-windows-restored");
    await initPromise;
    ok(
      finishInitStub.called,
      "Once the sessionstore-windows-restored event is observed, finishInit should be called."
    );

    Normandy.uiAvailableNotificationObserved = originalDeferred;
  }
);

decorate_task(withStub(RecipeRunner, "init"), async function testStartup() {
  const initObserved = TestUtils.topicObserved("shield-init-complete");
  await Normandy.finishInit();
  ok(RecipeRunner.init.called, "startup calls RecipeRunner.init");
  await initObserved;
});
