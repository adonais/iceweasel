import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { GlobalOverrider } from "test/unit/utils";
import { PrefsFeed } from "lib/PrefsFeed.sys.mjs";

let overrider = new GlobalOverrider();

describe("PrefsFeed", () => {
  let feed;
  let FAKE_PREFS;
  let sandbox;
  let ServicesStub;
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    FAKE_PREFS = new Map([
      ["foo", 1],
      ["bar", 2],
      ["baz", { value: 1, skipBroadcast: true }],
      ["qux", { value: 1, skipBroadcast: true, alsoToPreloaded: true }],
    ]);
    feed = new PrefsFeed(FAKE_PREFS);
    ServicesStub = {
      prefs: {
        clearUserPref: sinon.spy(),
        getStringPref: sinon.spy(),
        getIntPref: sinon.spy(),
        getBoolPref: sinon.spy(),
      },
      obs: {
        removeObserver: sinon.spy(),
        addObserver: sinon.spy(),
      },
    };
    sinon.spy(feed, "_setPref");
    feed.store = {
      dispatch: sinon.spy(),
      getState() {
        return this.state;
      },
    };
    // Setup for tests that don't call `init`
    feed._prefs = {
      get: sinon.spy(item => FAKE_PREFS.get(item)),
      set: sinon.spy((name, value) => FAKE_PREFS.set(name, value)),
      observe: sinon.spy(),
      observeBranch: sinon.spy(),
      ignore: sinon.spy(),
      ignoreBranch: sinon.spy(),
      reset: sinon.stub(),
      _branchStr: "branch.str.",
    };
    overrider.set({
      PrivateBrowsingUtils: { enabled: true },
      Services: ServicesStub,
    });
  });
  afterEach(() => {
    overrider.restore();
    sandbox.restore();
  });

  it("should set a pref when a SET_PREF action is received", () => {
    feed.onAction(ac.SetPref("foo", 2));
    assert.calledWith(feed._prefs.set, "foo", 2);
  });
  it("should call clearUserPref with action CLEAR_PREF", () => {
    feed.onAction({ type: at.CLEAR_PREF, data: { name: "pref.test" } });
    assert.calledWith(ServicesStub.prefs.clearUserPref, "branch.str.pref.test");
  });
  it("should dispatch PREFS_INITIAL_VALUES on init with pref values and .isPrivateBrowsingEnabled", () => {
    feed.onAction({ type: at.INIT });
    assert.calledOnce(feed.store.dispatch);
    assert.equal(
      feed.store.dispatch.firstCall.args[0].type,
      at.PREFS_INITIAL_VALUES
    );
    const [{ data }] = feed.store.dispatch.firstCall.args;
    assert.equal(data.foo, 1);
    assert.equal(data.bar, 2);
    assert.isTrue(data.isPrivateBrowsingEnabled);
  });
  it("should dispatch PREFS_INITIAL_VALUES with a .featureConfig", () => {
    sandbox.stub(global.NimbusFeatures.newtab, "getAllVariables").returns({
      prefsButtonIcon: "icon-foo",
    });
    feed.onAction({ type: at.INIT });
    assert.equal(
      feed.store.dispatch.firstCall.args[0].type,
      at.PREFS_INITIAL_VALUES
    );
    const [{ data }] = feed.store.dispatch.firstCall.args;
    assert.deepEqual(data.featureConfig, { prefsButtonIcon: "icon-foo" });
  });
  it("should dispatch PREFS_INITIAL_VALUES with an empty object if no experiment is returned", () => {
    sandbox.stub(global.NimbusFeatures.newtab, "getAllVariables").returns(null);
    feed.onAction({ type: at.INIT });
    assert.equal(
      feed.store.dispatch.firstCall.args[0].type,
      at.PREFS_INITIAL_VALUES
    );
    const [{ data }] = feed.store.dispatch.firstCall.args;
    assert.deepEqual(data.featureConfig, {});
  });
  it("should add one branch observer on init", () => {
    feed.onAction({ type: at.INIT });
    assert.calledOnce(feed._prefs.observeBranch);
    assert.calledWith(feed._prefs.observeBranch, feed);
  });
  it("should handle region on init", () => {
    feed.init();
    assert.equal(feed.geo, "US");
  });
  it("should add region observer on init", () => {
    sandbox.stub(global.Region, "home").get(() => "");
    feed.init();
    assert.equal(feed.geo, "");
    assert.calledWith(
      ServicesStub.obs.addObserver,
      feed,
      global.Region.REGION_TOPIC
    );
  });
  it("should remove the branch observer on uninit", () => {
    feed.onAction({ type: at.UNINIT });
    assert.calledOnce(feed._prefs.ignoreBranch);
    assert.calledWith(feed._prefs.ignoreBranch, feed);
  });
  it("should call removeObserver", () => {
    feed.geo = "";
    feed.uninit();
    assert.calledWith(
      ServicesStub.obs.removeObserver,
      feed,
      global.Region.REGION_TOPIC
    );
  });
  it("should send a PREF_CHANGED action when onPrefChanged is called", () => {
    feed.onPrefChanged("foo", 2);
    assert.calledWith(
      feed.store.dispatch,
      ac.BroadcastToContent({
        type: at.PREF_CHANGED,
        data: { name: "foo", value: 2 },
      })
    );
  });
  it("should send a PREF_CHANGED actions when onPocketExperimentUpdated is called", () => {
    sandbox
      .stub(global.NimbusFeatures.pocketNewtab, "getAllVariables")
      .returns({
        prefsButtonIcon: "icon-new",
      });
    feed.onPocketExperimentUpdated();
    assert.calledWith(
      feed.store.dispatch,
      ac.BroadcastToContent({
        type: at.PREF_CHANGED,
        data: {
          name: "pocketConfig",
          value: {
            prefsButtonIcon: "icon-new",
          },
        },
      })
    );
  });
  it("should not send a PREF_CHANGED actions when onPocketExperimentUpdated is called during startup", () => {
    sandbox
      .stub(global.NimbusFeatures.pocketNewtab, "getAllVariables")
      .returns({
        prefsButtonIcon: "icon-new",
      });
    feed.onPocketExperimentUpdated({}, "feature-experiment-loaded");
    assert.notCalled(feed.store.dispatch);
    feed.onPocketExperimentUpdated({}, "feature-rollout-loaded");
    assert.notCalled(feed.store.dispatch);
  });
  it("should send a PREF_CHANGED actions when onExperimentUpdated is called", () => {
    sandbox.stub(global.NimbusFeatures.newtab, "getAllVariables").returns({
      prefsButtonIcon: "icon-new",
    });
    feed.onExperimentUpdated();
    assert.calledWith(
      feed.store.dispatch,
      ac.BroadcastToContent({
        type: at.PREF_CHANGED,
        data: {
          name: "featureConfig",
          value: {
            prefsButtonIcon: "icon-new",
          },
        },
      })
    );
  });
  describe("newtabTrainhop", () => {
    it("should send a PREF_CHANGED actions when onTrainhopExperimentUpdated is called", () => {
      const testObject = {
        meta: {
          isRollout: false,
        },
        value: {
          type: "testExperiment",
          payload: {
            enabled: true,
          },
        },
      };
      sandbox
        .stub(global.NimbusFeatures.newtabTrainhop, "getAllEnrollments")
        .returns([testObject]);
      feed.onTrainhopExperimentUpdated();
      assert.calledWith(
        feed.store.dispatch,
        ac.BroadcastToContent({
          type: at.PREF_CHANGED,
          data: {
            name: "trainhopConfig",
            value: {
              testExperiment: testObject.value.payload,
            },
          },
        })
      );
    });
    it("should handle and dedupe multiple experiments and rollouts", () => {
      const testObject1 = {
        meta: {
          isRollout: false,
        },
        value: {
          type: "testExperiment1",
          payload: {
            enabled: true,
          },
        },
      };
      const testObject2 = {
        meta: {
          isRollout: false,
        },
        value: {
          type: "testExperiment1",
          payload: {
            enabled: false,
          },
        },
      };
      const testObject3 = {
        meta: {
          isRollout: true,
        },
        value: {
          type: "testExperiment2",
          payload: {
            enabled: true,
          },
        },
      };
      const testObject4 = {
        meta: {
          isRollout: false,
        },
        value: {
          type: "testExperiment2",
          payload: {
            enabled: false,
          },
        },
      };
      sandbox
        .stub(global.NimbusFeatures.newtabTrainhop, "getAllEnrollments")
        .returns([testObject1, testObject2, testObject3, testObject4]);
      feed.onTrainhopExperimentUpdated();
      assert.calledWith(
        feed.store.dispatch,
        ac.BroadcastToContent({
          type: at.PREF_CHANGED,
          data: {
            name: "trainhopConfig",
            value: {
              testExperiment1: testObject1.value.payload,
              testExperiment2: testObject4.value.payload,
            },
          },
        })
      );
    });
    it("should handle multi-payload format with single enrollment", () => {
      const testObject = {
        meta: {
          isRollout: false,
        },
        value: {
          type: "multi-payload",
          payload: [
            {
              type: "testExperiment",
              payload: {
                enabled: true,
                name: "test-name",
              },
            },
          ],
        },
      };
      sandbox
        .stub(global.NimbusFeatures.newtabTrainhop, "getAllEnrollments")
        .returns([testObject]);
      feed.onTrainhopExperimentUpdated();
      assert.calledWith(
        feed.store.dispatch,
        ac.BroadcastToContent({
          type: at.PREF_CHANGED,
          data: {
            name: "trainhopConfig",
            value: {
              testExperiment: {
                enabled: true,
                name: "test-name",
              },
            },
          },
        })
      );
    });
    it("should handle multi-payload format with multiple items in single enrollment", () => {
      const testObject = {
        meta: {
          isRollout: false,
        },
        value: {
          type: "multi-payload",
          payload: [
            {
              type: "testExperiment1",
              payload: {
                enabled: true,
              },
            },
            {
              type: "testExperiment2",
              payload: {
                enabled: false,
              },
            },
          ],
        },
      };
      sandbox
        .stub(global.NimbusFeatures.newtabTrainhop, "getAllEnrollments")
        .returns([testObject]);
      feed.onTrainhopExperimentUpdated();
      assert.calledWith(
        feed.store.dispatch,
        ac.BroadcastToContent({
          type: at.PREF_CHANGED,
          data: {
            name: "trainhopConfig",
            value: {
              testExperiment1: {
                enabled: true,
              },
              testExperiment2: {
                enabled: false,
              },
            },
          },
        })
      );
    });
    it("should dedupe multi-payload format with experiment taking precedence over rollout", () => {
      const rollout = {
        meta: {
          isRollout: true,
        },
        value: {
          type: "multi-payload",
          payload: [
            {
              type: "testExperiment",
              payload: {
                enabled: false,
                name: "rollout-name",
              },
            },
          ],
        },
      };
      const experiment = {
        meta: {
          isRollout: false,
        },
        value: {
          type: "multi-payload",
          payload: [
            {
              type: "testExperiment",
              payload: {
                enabled: true,
                name: "experiment-name",
              },
            },
          ],
        },
      };
      sandbox
        .stub(global.NimbusFeatures.newtabTrainhop, "getAllEnrollments")
        .returns([rollout, experiment]);
      feed.onTrainhopExperimentUpdated();
      assert.calledWith(
        feed.store.dispatch,
        ac.BroadcastToContent({
          type: at.PREF_CHANGED,
          data: {
            name: "trainhopConfig",
            value: {
              testExperiment: {
                enabled: true,
                name: "experiment-name",
              },
            },
          },
        })
      );
    });
  });
  it("should dispatch PREF_CHANGED when onWidgetsUpdated is called", () => {
    sandbox
      .stub(global.NimbusFeatures.newtabWidgets, "getAllVariables")
      .returns({
        enabled: true,
        listsEnabled: true,
        timerEnabled: false,
      });

    feed.onWidgetsUpdated();

    assert.calledWith(
      feed.store.dispatch,
      ac.BroadcastToContent({
        type: at.PREF_CHANGED,
        data: {
          name: "widgetsConfig",
          value: {
            enabled: true,
            listsEnabled: true,
            timerEnabled: false,
          },
        },
      })
    );
  });
  it("should remove all events on removeListeners", () => {
    feed.geo = "";
    sandbox.spy(global.NimbusFeatures.pocketNewtab, "offUpdate");
    sandbox.spy(global.NimbusFeatures.newtab, "offUpdate");
    sandbox.spy(global.NimbusFeatures.newtabTrainhop, "offUpdate");
    feed.removeListeners();
    assert.calledWith(
      global.NimbusFeatures.pocketNewtab.offUpdate,
      feed.onPocketExperimentUpdated
    );
    assert.calledWith(
      global.NimbusFeatures.newtab.offUpdate,
      feed.onExperimentUpdated
    );
    assert.calledWith(
      global.NimbusFeatures.newtabTrainhop.offUpdate,
      feed.onTrainhopExperimentUpdated
    );
    assert.calledWith(
      ServicesStub.obs.removeObserver,
      feed,
      global.Region.REGION_TOPIC
    );
  });
  it("should send OnlyToMain pref update if config for pref has skipBroadcast: true", async () => {
    feed.onPrefChanged("baz", { value: 2, skipBroadcast: true });
    assert.calledWith(
      feed.store.dispatch,
      ac.OnlyToMain({
        type: at.PREF_CHANGED,
        data: { name: "baz", value: { value: 2, skipBroadcast: true } },
      })
    );
  });
  it("should send AlsoToPreloaded pref update if config for pref has skipBroadcast: true and alsoToPreloaded: true", async () => {
    feed.onPrefChanged("qux", {
      value: 2,
      skipBroadcast: true,
      alsoToPreloaded: true,
    });
    assert.calledWith(
      feed.store.dispatch,
      ac.AlsoToPreloaded({
        type: at.PREF_CHANGED,
        data: {
          name: "qux",
          value: { value: 2, skipBroadcast: true, alsoToPreloaded: true },
        },
      })
    );
  });
  describe("#observe", () => {
    it("should call dispatch from observe", () => {
      feed.observe(undefined, global.Region.REGION_TOPIC);
      assert.calledOnce(feed.store.dispatch);
    });
  });
  describe("#_setStringPref", () => {
    it("should call _setPref and getStringPref from _setStringPref", () => {
      feed._setStringPref({}, "fake.pref", "default");
      assert.calledOnce(feed._setPref);
      assert.calledWith(
        feed._setPref,
        { "fake.pref": undefined },
        "fake.pref",
        "default"
      );
      assert.calledOnce(ServicesStub.prefs.getStringPref);
      assert.calledWith(
        ServicesStub.prefs.getStringPref,
        "browser.newtabpage.activity-stream.fake.pref",
        "default"
      );
    });
  });
  describe("#_setBoolPref", () => {
    it("should call _setPref and getBoolPref from _setBoolPref", () => {
      feed._setBoolPref({}, "fake.pref", false);
      assert.calledOnce(feed._setPref);
      assert.calledWith(
        feed._setPref,
        { "fake.pref": undefined },
        "fake.pref",
        false
      );
      assert.calledOnce(ServicesStub.prefs.getBoolPref);
      assert.calledWith(
        ServicesStub.prefs.getBoolPref,
        "browser.newtabpage.activity-stream.fake.pref",
        false
      );
    });
  });
  describe("#_setIntPref", () => {
    it("should call _setPref and getIntPref from _setIntPref", () => {
      feed._setIntPref({}, "fake.pref", 1);
      assert.calledOnce(feed._setPref);
      assert.calledWith(
        feed._setPref,
        { "fake.pref": undefined },
        "fake.pref",
        1
      );
      assert.calledOnce(ServicesStub.prefs.getIntPref);
      assert.calledWith(
        ServicesStub.prefs.getIntPref,
        "browser.newtabpage.activity-stream.fake.pref",
        1
      );
    });
  });
  describe("#_setPref", () => {
    it("should set pref value with _setPref", () => {
      const getPrefFunctionSpy = sinon.spy();
      const values = {};
      feed._setPref(values, "fake.pref", "default", getPrefFunctionSpy);
      assert.deepEqual(values, { "fake.pref": undefined });
      assert.calledOnce(getPrefFunctionSpy);
      assert.calledWith(
        getPrefFunctionSpy,
        "browser.newtabpage.activity-stream.fake.pref",
        "default"
      );
    });
  });
});
