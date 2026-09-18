/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { AIWindowAccountAuth } = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/ui/modules/AIWindowAccountAuth.sys.mjs"
);

const { SpecialMessageActions } = ChromeUtils.importESModule(
  "resource://messaging-system/lib/SpecialMessageActions.sys.mjs"
);

const { FxAccounts } = ChromeUtils.importESModule(
  "resource://gre/modules/FxAccounts.sys.mjs"
);

/**
 * Sets up the sign-in flow so promptSignIn can be driven to any of its
 * outcomes. Resets Glean first so each task reads its own events.
 *
 * @param {object} options
 * @param {boolean} [options.signedIn] What isSignedIn resolves to
 * @param {boolean} [options.canConnect] What canConnectAccount resolves to
 * @param {boolean|Error} [options.flow] What fxaSignInFlow resolves to, or an
 *   Error for it to reject with
 * @returns {object} The sandbox and the fxaSignInFlow stub
 */
function stubSignInFlow({ signedIn = false, canConnect = true, flow = true }) {
  Services.fog.testResetFOG();

  const sb = sinon.createSandbox();
  const isSignedIn = sb
    .stub(AIWindowAccountAuth, "isSignedIn")
    .resolves(signedIn);
  sb.stub(FxAccounts, "canConnectAccount").resolves(canConnect);
  const fxaSignInFlow = sb.stub(SpecialMessageActions, "fxaSignInFlow");
  if (flow instanceof Error) {
    fxaSignInFlow.rejects(flow);
  } else {
    fxaSignInFlow.resolves(flow);
  }

  return { sb, isSignedIn, fxaSignInFlow };
}

function singleEventExtra(metric, name) {
  const events = metric.testGetValue();
  Assert.equal(events?.length, 1, `One ${name} was recorded`);
  return events[0].extra;
}

add_task(async function test_autoClose_false_when_firstrun_not_completed() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.firstrun.hasCompleted", false],
      ["browser.smartwindow.tos.consentTime", 0],
    ],
  });

  const stub = sinon
    .stub(SpecialMessageActions, "fxaSignInFlow")
    .resolves(true);

  try {
    await AIWindowAccountAuth.promptSignIn(gBrowser.selectedBrowser);

    Assert.ok(stub.calledOnce, "fxaSignInFlow should be called once");

    const callArgs = stub.getCall(0).args[0];
    Assert.equal(
      callArgs.autoClose,
      false,
      "autoClose should be false when firstrun has not completed"
    );
  } finally {
    stub.restore();
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_autoClose_true_when_firstrun_completed() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.smartwindow.firstrun.hasCompleted", true],
      ["browser.smartwindow.tos.consentTime", 1735689600],
    ],
  });

  const stub = sinon
    .stub(SpecialMessageActions, "fxaSignInFlow")
    .resolves(true);

  try {
    await AIWindowAccountAuth.promptSignIn(gBrowser.selectedBrowser);

    Assert.ok(stub.calledOnce, "fxaSignInFlow should be called once");

    const callArgs = stub.getCall(0).args[0];
    Assert.equal(
      callArgs.autoClose,
      true,
      "autoClose should be true when firstrun has completed"
    );
  } finally {
    stub.restore();
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_signin_flow_started_reason() {
  const cases = [
    { consentTime: 0, signedIn: false, reason: "both" },
    { consentTime: 0, signedIn: true, reason: "no_consent" },
    { consentTime: 1735689600, signedIn: false, reason: "signed_out" },
    { consentTime: 1735689600, signedIn: true, reason: "none" },
  ];

  for (const { consentTime, signedIn, reason } of cases) {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.tos.consentTime", consentTime]],
    });
    const { sb } = stubSignInFlow({ signedIn });

    try {
      await AIWindowAccountAuth.promptSignIn(gBrowser.selectedBrowser);

      Assert.equal(
        singleEventExtra(
          Glean.smartWindow.signinFlowStarted,
          "signin_flow_started"
        ).reason,
        reason,
        `reason is ${reason} with consentTime ${consentTime} and signedIn ${signedIn}`
      );
    } finally {
      sb.restore();
      await SpecialPowers.popPrefEnv();
    }
  }
});

add_task(async function test_signin_flow_completed_outcome() {
  for (const [flow, outcome] of [
    [true, "completed"],
    [false, "abandoned"],
  ]) {
    const { sb } = stubSignInFlow({ flow });

    try {
      const didSignIn = await AIWindowAccountAuth.promptSignIn(
        gBrowser.selectedBrowser
      );

      Assert.equal(didSignIn, flow, "promptSignIn returns the flow result");
      Assert.equal(
        singleEventExtra(
          Glean.smartWindow.signinFlowCompleted,
          "signin_flow_completed"
        ).outcome,
        outcome,
        `outcome is ${outcome} when fxaSignInFlow resolves ${flow}`
      );
    } finally {
      sb.restore();
    }
  }
});

add_task(
  async function test_ensureAIWindowAccess_records_nothing_when_allowed() {
    await SpecialPowers.pushPrefEnv({
      set: [["browser.smartwindow.tos.consentTime", 1735689600]],
    });
    const { sb, fxaSignInFlow } = stubSignInFlow({ signedIn: true });

    try {
      Assert.ok(
        await AIWindowAccountAuth.ensureAIWindowAccess(
          gBrowser.selectedBrowser
        ),
        "Access is allowed"
      );
      Assert.ok(fxaSignInFlow.notCalled, "No sign-in flow is started");
      Assert.equal(
        Glean.smartWindow.signinFlowStarted.testGetValue(),
        null,
        "No signin_flow_started is recorded"
      );
    } finally {
      sb.restore();
      await SpecialPowers.popPrefEnv();
    }
  }
);
