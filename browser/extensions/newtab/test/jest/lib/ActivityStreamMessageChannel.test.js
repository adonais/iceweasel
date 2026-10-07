/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import {
  ActivityStreamMessageChannel,
  DEFAULT_OPTIONS,
} from "lib/ActivityStreamMessageChannel.sys.mjs";
import { applyMiddleware, createStore } from "redux";
import { stubGlobals } from "test/jest/test-utils";

const OPTIONS = [
  "pageURL",
  "outgoingMessageName",
  "incomingMessageName",
  "dispatch",
];

// A simple dummy reducer for testing that adds a number.
function addNumberReducer(prevState = 0, action) {
  return action.type === "ADD" ? prevState + action.data : prevState;
}

// Create an object containing details about a tab as expected within
// the loaded tabs map in ActivityStreamMessageChannel.sys.mjs.
function getTabDetails(portID, url = "about:newtab", extraArgs = {}) {
  let actor = {
    portID,
    sendAsyncMessage: jest.fn(),
  };
  let browser = {
    getAttribute: () => (extraArgs.preloaded ? "preloaded" : ""),
    documentGlobal: {
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  };
  let browsingContext = {
    top: {
      embedderElement: browser,
    },
  };

  let data = {
    data: {
      actor,
      browser,
      browsingContext,
      portID,
      url,
    },
    target: {
      browsingContext,
    },
  };

  if (extraArgs.loaded) {
    data.data.loaded = extraArgs.loaded;
  }
  if (extraArgs.simulated) {
    data.data.simulated = extraArgs.simulated;
  }

  return data;
}

describe("ActivityStreamMessageChannel", () => {
  let restoreGlobals;
  let dispatch;
  let mm;
  let flushQueuedMessagesFromContent;

  beforeEach(() => {
    flushQueuedMessagesFromContent = jest.fn();
    restoreGlobals = stubGlobals({
      AboutHomeStartupCache: { onPreloadedNewTabMessage() {} },
      AboutNewTabParent: { flushQueuedMessagesFromContent },
    });

    dispatch = jest.fn();
    mm = new ActivityStreamMessageChannel({ dispatch });

    expect(mm.loadedTabs).toBeTruthy();

    let loadedTabs = new Map();
    Object.defineProperty(mm, "loadedTabs", {
      configurable: true,
      get: () => loadedTabs,
    });
  });

  afterEach(() => restoreGlobals());

  describe("portID validation", () => {
    let errorSpy;
    beforeEach(() => {
      errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
      errorSpy.mockRestore();
    });
    it("should log errors for an invalid portID", () => {
      mm.validatePortID({});
      mm.validatePortID({});
      mm.validatePortID({});

      expect(errorSpy).toHaveBeenCalledTimes(3);
    });
  });

  it("should exist", () => {
    expect(ActivityStreamMessageChannel).toBeTruthy();
  });
  it("should apply default options", () => {
    mm = new ActivityStreamMessageChannel();
    OPTIONS.forEach(o => expect(mm[o]).toBe(DEFAULT_OPTIONS[o]));
  });
  it("should add options", () => {
    const options = {
      dispatch: () => {},
      pageURL: "FOO.html",
      outgoingMessageName: "OUT",
      incomingMessageName: "IN",
    };
    mm = new ActivityStreamMessageChannel(options);
    OPTIONS.forEach(o => expect(mm[o]).toBe(options[o]));
  });
  it("should throw an error if no dispatcher was provided", () => {
    mm = new ActivityStreamMessageChannel();
    expect(() => mm.dispatch({ type: "FOO" })).toThrow();
  });
  describe("Creating/destroying the channel", () => {
    describe("#simulateMessagesForExistingTabs", () => {
      let onActionFromContent;
      beforeEach(() => {
        onActionFromContent = jest
          .spyOn(mm, "onActionFromContent")
          .mockImplementation(() => {});
      });
      it("should simulate init for existing ports", () => {
        let msg1 = getTabDetails("inited", "about:monkeys", {
          simulated: true,
        });
        mm.loadedTabs.set(msg1.data.browser, msg1.data);

        let msg2 = getTabDetails("loaded", "about:sheep", {
          simulated: true,
        });
        mm.loadedTabs.set(msg2.data.browser, msg2.data);

        mm.simulateMessagesForExistingTabs();

        expect(onActionFromContent.mock.calls[0][0]).toEqual({
          type: at.NEW_TAB_INIT,
          data: msg1.data,
        });
        expect(onActionFromContent.mock.calls[1][0]).toEqual({
          type: at.NEW_TAB_INIT,
          data: msg2.data,
        });
      });
      it("should simulate load for loaded ports", () => {
        let msg3 = getTabDetails("foo", null, {
          preloaded: true,
          loaded: true,
        });
        mm.loadedTabs.set(msg3.data.browser, msg3.data);

        mm.simulateMessagesForExistingTabs();

        expect(onActionFromContent).toHaveBeenCalledWith(
          { type: at.NEW_TAB_LOAD },
          "foo"
        );
      });
      it("should set renderLayers on preloaded browsers after load", () => {
        let msg4 = getTabDetails("foo", null, {
          preloaded: true,
          loaded: true,
        });
        msg4.data.browser.documentGlobal = {
          STATE_MAXIMIZED: 1,
          STATE_MINIMIZED: 2,
          STATE_NORMAL: 3,
          STATE_FULLSCREEN: 4,
          windowState: 3,
          isFullyOccluded: false,
          addEventListener: () => {},
          removeEventListener: () => {},
        };
        mm.loadedTabs.set(msg4.data.browser, msg4.data);
        mm.simulateMessagesForExistingTabs();
        expect(msg4.data.browser.renderLayers).toBe(true);
      });
      it("should flush queued messages from content when doing the simulation", () => {
        expect(flushQueuedMessagesFromContent).not.toHaveBeenCalled();
        mm.simulateMessagesForExistingTabs();
        expect(flushQueuedMessagesFromContent).toHaveBeenCalledTimes(1);
      });
    });
  });
  describe("Message handling", () => {
    describe("#getTargetById", () => {
      it("should get an id if it exists", () => {
        let msg = getTabDetails("foo:1");
        mm.loadedTabs.set(msg.data.browser, msg.data);
        expect(mm.getTargetById("foo:1")).toBe(msg.data.actor);
      });
      it("should return null if the target doesn't exist", () => {
        let msg = getTabDetails("foo:2");
        mm.loadedTabs.set(msg.data.browser, msg.data);
        expect(mm.getTargetById("bar:3")).toBeNull();
      });
    });
    describe("#getPreloadedActors", () => {
      it("should get a preloaded actor if it exists", () => {
        let msg = getTabDetails("foo:3", null, { preloaded: true });
        mm.loadedTabs.set(msg.data.browser, msg.data);
        expect(mm.getPreloadedActors()[0].portID).toBe("foo:3");
      });
      it("should get all the preloaded actors across windows if they exist", () => {
        let msg = getTabDetails("foo:4a", null, { preloaded: true });
        mm.loadedTabs.set(msg.data.browser, msg.data);
        msg = getTabDetails("foo:4b", null, { preloaded: true });
        mm.loadedTabs.set(msg.data.browser, msg.data);
        expect(mm.getPreloadedActors()).toHaveLength(2);
      });
      it("should return null if there is no preloaded actor", () => {
        let msg = getTabDetails("foo:5");
        mm.loadedTabs.set(msg.data.browser, msg.data);
        expect(mm.getPreloadedActors()).toBeNull();
      });
    });
    describe("#onNewTabInit", () => {
      it("should dispatch a NEW_TAB_INIT action", () => {
        let msg = getTabDetails("foo", "about:monkeys");
        const onActionFromContent = jest
          .spyOn(mm, "onActionFromContent")
          .mockImplementation(() => {});

        mm.onNewTabInit(msg, msg.data);

        expect(onActionFromContent.mock.calls[0][0]).toEqual({
          type: at.NEW_TAB_INIT,
          data: msg.data,
        });
      });
    });
    describe("#onNewTabLoad", () => {
      it("should dispatch a NEW_TAB_LOAD action", () => {
        let msg = getTabDetails("foo", null, { preloaded: true });
        mm.loadedTabs.set(msg.data.browser, msg.data);
        const onActionFromContent = jest
          .spyOn(mm, "onActionFromContent")
          .mockImplementation(() => {});
        mm.onNewTabLoad({ target: msg.target }, msg.data);
        expect(onActionFromContent).toHaveBeenCalledWith(
          { type: at.NEW_TAB_LOAD },
          "foo"
        );
      });
    });
    describe("#onNewTabUnload", () => {
      it("should dispatch a NEW_TAB_UNLOAD action", () => {
        let msg = getTabDetails("foo");
        mm.loadedTabs.set(msg.data.browser, msg.data);
        const onActionFromContent = jest
          .spyOn(mm, "onActionFromContent")
          .mockImplementation(() => {});
        mm.onNewTabUnload({ target: msg.target }, msg.data);
        expect(onActionFromContent).toHaveBeenCalledWith(
          { type: at.NEW_TAB_UNLOAD },
          "foo"
        );
      });
    });
    describe("#onMessage", () => {
      let errorSpy;
      beforeEach(() => {
        errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      });
      afterEach(() => {
        errorSpy.mockRestore();
      });
      it("return early when tab details are not present", () => {
        let msg = getTabDetails("foo");
        const onActionFromContent = jest
          .spyOn(mm, "onActionFromContent")
          .mockImplementation(() => {});
        mm.onMessage(msg, msg.data);
        expect(onActionFromContent).not.toHaveBeenCalled();
      });
      it("should report an error if the msg.data is missing", () => {
        let msg = getTabDetails("foo");
        mm.loadedTabs.set(msg.data.browser, msg.data);
        let tabDetails = msg.data;
        delete msg.data;
        mm.onMessage(msg, tabDetails);
        expect(errorSpy).toHaveBeenCalledTimes(1);
      });
      it("should report an error if the msg.data.type is missing", () => {
        let msg = getTabDetails("foo");
        mm.loadedTabs.set(msg.data.browser, msg.data);
        msg.data = "foo";
        mm.onMessage(msg, msg.data);
        expect(errorSpy).toHaveBeenCalledTimes(1);
      });
      it("should call onActionFromContent", () => {
        const onActionFromContent = jest
          .spyOn(mm, "onActionFromContent")
          .mockImplementation(() => {});
        let msg = getTabDetails("foo");
        mm.loadedTabs.set(msg.data.browser, msg.data);
        let action = {
          data: { data: {}, type: "FOO" },
          target: msg.target,
        };
        const expectedAction = {
          type: action.data.type,
          data: action.data.data,
          _target: {
            browser: msg.data.browser,
            window: msg.data.browser.documentGlobal,
          },
        };
        mm.onMessage(action, msg.data);
        expect(onActionFromContent).toHaveBeenCalledWith(expectedAction, "foo");
      });
    });
  });
  describe("Sending and broadcasting", () => {
    describe("#send", () => {
      it("should send a message on the right port", () => {
        let msg = getTabDetails("foo:6");
        mm.loadedTabs.set(msg.data.browser, msg.data);
        const action = ac.AlsoToOneContent({ type: "HELLO" }, "foo:6");
        mm.send(action);
        expect(msg.data.actor.sendAsyncMessage).toHaveBeenCalledWith(
          DEFAULT_OPTIONS.outgoingMessageName,
          action
        );
      });
      it("should not throw if the target isn't around", () => {
        // port is not added to the channel
        const action = ac.AlsoToOneContent({ type: "HELLO" }, "foo:7");

        expect(() => mm.send(action)).not.toThrow();
      });
    });
    describe("#broadcast", () => {
      it("should send a message on the channel", () => {
        let msg = getTabDetails("foo:8");
        mm.loadedTabs.set(msg.data.browser, msg.data);
        const action = ac.BroadcastToContent({ type: "HELLO" });
        mm.broadcast(action);
        expect(msg.data.actor.sendAsyncMessage).toHaveBeenCalledWith(
          DEFAULT_OPTIONS.outgoingMessageName,
          action
        );
      });
    });
    describe("#preloaded browser", () => {
      it("should send the message to the preloaded browser if there's data and a preloaded browser exists", () => {
        let msg = getTabDetails("foo:9", null, { preloaded: true });
        mm.loadedTabs.set(msg.data.browser, msg.data);
        const action = ac.AlsoToPreloaded({ type: "HELLO", data: 10 });
        mm.sendToPreloaded(action);
        expect(msg.data.actor.sendAsyncMessage).toHaveBeenCalledWith(
          DEFAULT_OPTIONS.outgoingMessageName,
          action
        );
      });
      it("should send the message to all the preloaded browsers if there's data and they exist", () => {
        let msg1 = getTabDetails("foo:10a", null, { preloaded: true });
        mm.loadedTabs.set(msg1.data.browser, msg1.data);

        let msg2 = getTabDetails("foo:10b", null, { preloaded: true });
        mm.loadedTabs.set(msg2.data.browser, msg2.data);

        mm.sendToPreloaded(ac.AlsoToPreloaded({ type: "HELLO", data: 10 }));
        expect(msg1.data.actor.sendAsyncMessage).toHaveBeenCalledTimes(1);
        expect(msg2.data.actor.sendAsyncMessage).toHaveBeenCalledTimes(1);
      });
      it("should not send the message to the preloaded browser if there's no data and a preloaded browser does not exists", () => {
        let msg = getTabDetails("foo:11");
        mm.loadedTabs.set(msg.data.browser, msg.data);
        const action = ac.AlsoToPreloaded({ type: "HELLO" });
        mm.sendToPreloaded(action);
        expect(msg.data.actor.sendAsyncMessage).not.toHaveBeenCalled();
      });
    });
  });
  describe("Handling actions", () => {
    describe("#onActionFromContent", () => {
      beforeEach(() => mm.onActionFromContent({ type: "FOO" }, "foo:12"));
      it("should dispatch a AlsoToMain action", () => {
        expect(dispatch).toHaveBeenCalledTimes(1);
        const [[action]] = dispatch.mock.calls;
        expect(action.type).toBe("FOO");
      });
      it("should have the right fromTarget", () => {
        const [[action]] = dispatch.mock.calls;
        expect(action.meta.fromTarget).toBe("foo:12");
      });
    });
    describe("#middleware", () => {
      let store;
      beforeEach(() => {
        store = createStore(addNumberReducer, applyMiddleware(mm.middleware));
      });
      it("should just call next if no channel is found", () => {
        store.dispatch({ type: "ADD", data: 10 });
        expect(store.getState()).toBe(10);
      });
      it("should call .send but not affect the main store if an OnlyToOneContent action is dispatched", () => {
        const send = jest.spyOn(mm, "send").mockImplementation(() => {});
        const action = ac.OnlyToOneContent({ type: "ADD", data: 10 }, "foo");

        store.dispatch(action);

        expect(send).toHaveBeenCalledWith(action);
        expect(store.getState()).toBe(0);
      });
      it("should call .send and update the main store if an AlsoToOneContent action is dispatched", () => {
        const send = jest.spyOn(mm, "send").mockImplementation(() => {});
        const action = ac.AlsoToOneContent({ type: "ADD", data: 10 }, "foo");

        store.dispatch(action);

        expect(send).toHaveBeenCalledWith(action);
        expect(store.getState()).toBe(10);
      });
      it("should call .broadcast if the action is BroadcastToContent", () => {
        const broadcast = jest
          .spyOn(mm, "broadcast")
          .mockImplementation(() => {});
        const action = ac.BroadcastToContent({ type: "FOO" });

        store.dispatch(action);

        expect(broadcast).toHaveBeenCalledWith(action);
      });
      it("should call .sendToPreloaded if the action is AlsoToPreloaded", () => {
        const sendToPreloaded = jest
          .spyOn(mm, "sendToPreloaded")
          .mockImplementation(() => {});
        const action = ac.AlsoToPreloaded({ type: "FOO" });

        store.dispatch(action);

        expect(sendToPreloaded).toHaveBeenCalledWith(action);
      });
      it("should dispatch other actions normally", () => {
        const send = jest.spyOn(mm, "send").mockImplementation(() => {});
        const broadcast = jest
          .spyOn(mm, "broadcast")
          .mockImplementation(() => {});
        const sendToPreloaded = jest
          .spyOn(mm, "sendToPreloaded")
          .mockImplementation(() => {});

        store.dispatch({ type: "ADD", data: 1 });

        expect(store.getState()).toBe(1);
        expect(send).not.toHaveBeenCalled();
        expect(broadcast).not.toHaveBeenCalled();
        expect(sendToPreloaded).not.toHaveBeenCalled();
      });
    });
  });
});
