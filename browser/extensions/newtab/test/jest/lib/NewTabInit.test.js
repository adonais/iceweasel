/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { NewTabInit } from "lib/NewTabInit.sys.mjs";

describe("NewTabInit", () => {
  let instance;
  let store;
  let STATE;
  const requestFromTab = portID =>
    instance.onAction(
      ac.AlsoToMain({ type: at.NEW_TAB_STATE_REQUEST }, portID)
    );
  beforeEach(() => {
    STATE = {};
    store = { getState: jest.fn(() => STATE), dispatch: jest.fn() };
    instance = new NewTabInit();
    instance.store = store;
  });
  it("should reply with a copy of the state immediately", () => {
    requestFromTab(123);

    const resp = ac.AlsoToOneContent(
      { type: at.NEW_TAB_INITIAL_STATE, data: STATE },
      123
    );
    expect(store.dispatch).toHaveBeenCalledWith(resp);
  });
  describe("early / simulated new tabs", () => {
    const simulateTabInit = portID =>
      instance.onAction({
        type: at.NEW_TAB_INIT,
        data: { portID, simulated: true },
      });
    beforeEach(() => {
      simulateTabInit("foo");
    });
    it("should dispatch if not replied yet", () => {
      requestFromTab("foo");

      expect(store.dispatch).toHaveBeenCalledWith(
        ac.AlsoToOneContent(
          { type: at.NEW_TAB_INITIAL_STATE, data: STATE },
          "foo"
        )
      );
    });
    it("should dispatch once for multiple requests", () => {
      requestFromTab("foo");
      requestFromTab("foo");
      requestFromTab("foo");

      expect(store.dispatch).toHaveBeenCalledTimes(1);
    });
    describe("multiple tabs", () => {
      beforeEach(() => {
        simulateTabInit("bar");
      });
      it("should dispatch once to each tab", () => {
        requestFromTab("foo");
        requestFromTab("bar");
        expect(store.dispatch).toHaveBeenCalledTimes(2);
        requestFromTab("foo");
        requestFromTab("bar");

        expect(store.dispatch).toHaveBeenCalledTimes(2);
      });
      it("should clean up when tabs close", () => {
        expect(instance._repliedEarlyTabs.size).toBe(2);
        instance.onAction(ac.AlsoToMain({ type: at.NEW_TAB_UNLOAD }, "foo"));
        expect(instance._repliedEarlyTabs.size).toBe(1);
        instance.onAction(ac.AlsoToMain({ type: at.NEW_TAB_UNLOAD }, "foo"));
        expect(instance._repliedEarlyTabs.size).toBe(1);
        instance.onAction(ac.AlsoToMain({ type: at.NEW_TAB_UNLOAD }, "bar"));
        expect(instance._repliedEarlyTabs.size).toBe(0);
      });
    });
  });
});
