import { GlobalOverrider } from "tests/unit/utils";
import { MultistageWithDismiss } from "content-src/components/MultistageWithDismiss";
import { CARD_STACK_TRANSITION_OUT_TIME } from "content-src/components/MultiStageAboutWelcome";
import React from "react";
import { mount } from "enzyme";

const spinEventLoop = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

describe("MultistageWithDismiss", () => {
  let globals;
  let sandbox;
  let clock;
  let originalFinish;

  const makeConfig = ({
    position = "card-stack",
    transitions = true,
  } = {}) => ({
    id: "TEST_MESSAGE",
    transitions,
    screens: [
      {
        id: "SCREEN_1",
        content: {
          position,
          title: "test title",
          primary_button: { label: "Primary", action: { dismiss: true } },
        },
      },
    ],
  });

  // Mounts past the initial screen-filtering pass, so the effect has run.
  const mountWrapper = async (config, handleDismiss = () => {}) => {
    const wrapper = mount(
      <MultistageWithDismiss
        config={config}
        handleDismiss={handleDismiss}
        handleBlock={() => {}}
      />
    );
    await spinEventLoop();
    wrapper.update();
    return wrapper;
  };

  const wrapperClasses = wrapper =>
    wrapper.find("div.multistage-newtab-wrapper").first().prop("className");

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // What mountMultistageMessage installs in production; the effect wraps it
    // rather than the handleDismiss prop, which only serves the corner button.
    originalFinish = sandbox.stub();
    globals = new GlobalOverrider();
    globals.set({
      AWEvaluateScreenTargeting: () => {},
      AWGetSelectedTheme: () => Promise.resolve("automatic"),
      AWGetInstalledAddons: () => Promise.resolve([]),
      AWGetUnhandledCampaignAction: () => Promise.resolve(false),
      AWSendEventTelemetry: () => {},
      AWSendToParent: () => {},
      AWFinish: originalFinish,
    });
  });

  afterEach(() => {
    clock?.restore();
    clock = null;
    sandbox.restore();
    globals.restore();
  });

  describe("wrapper classes", () => {
    it("should mark an animated card stack", async () => {
      const wrapper = await mountWrapper(makeConfig());

      assert.include(wrapperClasses(wrapper), "card-stack-animated");
    });

    it("should not mark a card stack that opted out of transitions", async () => {
      const wrapper = await mountWrapper(makeConfig({ transitions: false }));

      assert.notInclude(wrapperClasses(wrapper), "card-stack-animated");
    });

    it("should not mark a non-card-stack message", async () => {
      const wrapper = await mountWrapper(makeConfig({ position: "center" }));

      assert.notInclude(wrapperClasses(wrapper), "card-stack-animated");
    });

    it("should mark the wrapper as exiting once AWFinish runs", async () => {
      const wrapper = await mountWrapper(makeConfig());
      clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      window.AWFinish();
      wrapper.update();

      assert.include(wrapperClasses(wrapper), "card-stack-exiting");
    });
  });

  describe("AWFinish wrapping", () => {
    it("should leave AWFinish alone for a non-animated message", async () => {
      await mountWrapper(makeConfig({ transitions: false }));

      assert.equal(window.AWFinish, originalFinish);
    });

    it("should leave AWFinish alone for a non-card-stack message", async () => {
      await mountWrapper(makeConfig({ position: "center" }));

      assert.equal(window.AWFinish, originalFinish);
    });

    it("should defer the teardown for an animated card stack", async () => {
      await mountWrapper(makeConfig());
      clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      window.AWFinish();
      assert.notCalled(originalFinish);

      clock.tick(CARD_STACK_TRANSITION_OUT_TIME + 1);
      assert.calledOnce(originalFinish);
    });

    it("should ignore repeat calls while exiting", async () => {
      await mountWrapper(makeConfig());
      clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      window.AWFinish();
      window.AWFinish();
      window.AWFinish();

      clock.tick(CARD_STACK_TRANSITION_OUT_TIME + 1);
      assert.calledOnce(originalFinish);
    });

    it("should restore AWFinish and drop the pending timer on unmount", async () => {
      const wrapper = await mountWrapper(makeConfig());
      clock = sinon.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      window.AWFinish();
      wrapper.unmount();

      assert.equal(window.AWFinish, originalFinish);
      clock.tick(CARD_STACK_TRANSITION_OUT_TIME + 1);
      assert.notCalled(originalFinish);
    });
  });
});
