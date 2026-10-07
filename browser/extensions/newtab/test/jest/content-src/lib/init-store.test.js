/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { actionCreators as ac, actionTypes as at } from "common/Actions.mjs";
import { stubGlobals } from "test/jest/test-utils";
import {
  INCOMING_MESSAGE_NAME,
  initStore,
  MERGE_STORE_ACTION,
  OUTGOING_MESSAGE_NAME,
  rehydrationMiddleware,
} from "content-src/lib/init-store";

function addNumberReducer(prevState = 0, action) {
  return action.type === "ADD" ? prevState + action.data : prevState;
}

describe("initStore", () => {
  let restoreGlobals;
  let store;
  beforeEach(() => {
    restoreGlobals = stubGlobals({
      RPMSendAsyncMessage: jest.fn(),
      RPMAddMessageListener: jest.fn(),
      // initStore's message listener dumps alongside console.error; jsdom has
      // no dump().
      dump: jest.fn(),
      __FROM_STARTUP_CACHE__: false,
    });
    store = initStore({ number: addNumberReducer });
  });
  afterEach(() => restoreGlobals());
  it("should create a store with the provided reducers", () => {
    expect(store).toBeTruthy();
    expect(store.getState()).toHaveProperty("number");
  });
  it("should add a listener that dispatches actions", () => {
    expect(globalThis.RPMAddMessageListener).toHaveBeenCalledWith(
      INCOMING_MESSAGE_NAME,
      expect.any(Function)
    );
    const [[, listener]] = globalThis.RPMAddMessageListener.mock.calls;
    jest.spyOn(store, "dispatch");
    const message = { name: INCOMING_MESSAGE_NAME, data: { type: "FOO" } };

    listener(message);

    expect(store.dispatch).toHaveBeenCalledWith(message.data);
  });
  it("should not throw if RPMAddMessageListener is not defined", () => {
    // Note: this is being set/restored by stubGlobals
    delete globalThis.RPMAddMessageListener;

    expect(() => initStore({ number: addNumberReducer })).not.toThrow();
  });
  it("should log errors from failed messages", () => {
    const [[, callback]] = globalThis.RPMAddMessageListener.mock.calls;
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    jest.spyOn(store, "dispatch").mockImplementation(() => {
      throw new Error("failed");
    });

    const message = {
      name: INCOMING_MESSAGE_NAME,
      data: { type: MERGE_STORE_ACTION },
    };
    callback(message);

    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
  it("should replace the state if a MERGE_STORE_ACTION is dispatched", () => {
    store.dispatch({ type: MERGE_STORE_ACTION, data: { number: 42 } });
    expect(store.getState()).toEqual({ number: 42 });
  });
  it("should call .send and update the local store if an AlsoToMain action is dispatched", () => {
    const subscriber = jest.fn();
    const action = ac.AlsoToMain({ type: "FOO" });

    store.subscribe(subscriber);
    store.dispatch(action);

    expect(globalThis.RPMSendAsyncMessage).toHaveBeenCalledWith(
      OUTGOING_MESSAGE_NAME,
      action
    );
    expect(subscriber).toHaveBeenCalledTimes(1);
  });
  it("should call .send but not update the local store if an OnlyToMain action is dispatched", () => {
    const subscriber = jest.fn();
    const action = ac.OnlyToMain({ type: "FOO" });

    store.subscribe(subscriber);
    store.dispatch(action);

    expect(globalThis.RPMSendAsyncMessage).toHaveBeenCalledWith(
      OUTGOING_MESSAGE_NAME,
      action
    );
    expect(subscriber).not.toHaveBeenCalled();
  });
  it("should not send out other types of actions", () => {
    store.dispatch({ type: "FOO" });
    expect(globalThis.RPMSendAsyncMessage).not.toHaveBeenCalled();
  });
  describe("rehydrationMiddleware", () => {
    it("should allow NEW_TAB_STATE_REQUEST to go through", () => {
      const action = ac.AlsoToMain({ type: at.NEW_TAB_STATE_REQUEST });
      const next = jest.fn();
      rehydrationMiddleware(store)(next)(action);
      expect(next).toHaveBeenCalledWith(action);
    });
    it("should dispatch an additional NEW_TAB_STATE_REQUEST if INIT was received after a request", () => {
      const requestAction = ac.AlsoToMain({ type: at.NEW_TAB_STATE_REQUEST });
      const next = jest.fn();
      const dispatch = rehydrationMiddleware(store)(next);

      dispatch(requestAction);
      next.mockClear();
      dispatch({ type: at.INIT });

      expect(next).toHaveBeenCalledWith(requestAction);
    });
    it("should allow MERGE_STORE_ACTION to go through", () => {
      const action = { type: MERGE_STORE_ACTION };
      const next = jest.fn();
      rehydrationMiddleware(store)(next)(action);
      expect(next).toHaveBeenCalledWith(action);
    });
    it("should not allow actions from main to go through before MERGE_STORE_ACTION was received", () => {
      const next = jest.fn();
      const dispatch = rehydrationMiddleware(store)(next);

      dispatch(ac.BroadcastToContent({ type: "FOO" }));
      dispatch(ac.AlsoToOneContent({ type: "FOO" }, 123));

      expect(next).not.toHaveBeenCalled();
    });
    it("should allow all local actions to go through", () => {
      const action = { type: "FOO" };
      const next = jest.fn();
      rehydrationMiddleware(store)(next)(action);
      expect(next).toHaveBeenCalledWith(action);
    });
    it("should allow actions from main to go through after MERGE_STORE_ACTION has been received", () => {
      const next = jest.fn();
      const dispatch = rehydrationMiddleware(store)(next);

      dispatch({ type: MERGE_STORE_ACTION });
      next.mockClear();

      const action = ac.AlsoToOneContent({ type: "FOO" }, 123);
      dispatch(action);
      expect(next).toHaveBeenCalledWith(action);
    });
    it("should not let startup actions go through for the preloaded about:home document", () => {
      globalThis.__FROM_STARTUP_CACHE__ = true;
      const next = jest.fn();
      const dispatch = rehydrationMiddleware(store)(next);
      const action = ac.BroadcastToContent(
        { type: "FOO", meta: { isStartup: true } },
        123
      );
      dispatch(action);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
