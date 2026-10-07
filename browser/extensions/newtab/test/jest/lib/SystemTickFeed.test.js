/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { actionTypes as at } from "common/Actions.mjs";
import { mockServices, stubGlobals } from "test/jest/test-utils";

describe("System Tick Feed", () => {
  let SYSTEM_TICK_INTERVAL;
  let SystemTickFeed;
  let restoreChromeUtils;
  let restoreGlobals;
  let instance;

  // SystemTickFeed.sys.mjs pulls setInterval/clearInterval through
  // ChromeUtils.defineESModuleGetters at load time. Pointing the lazy holder's
  // prototype at globalThis makes those resolve to whatever timers are
  // installed when they are called, so jest's fake timers are picked up.
  beforeAll(async () => {
    restoreChromeUtils = stubGlobals({
      ChromeUtils: {
        defineESModuleGetters: object => {
          Object.setPrototypeOf(object, globalThis);
          return globalThis;
        },
        idleDispatch: f => f(),
      },
    });
    ({ SYSTEM_TICK_INTERVAL, SystemTickFeed } =
      await import("lib/SystemTickFeed.sys.mjs"));
  });

  afterAll(() => {
    restoreChromeUtils();
  });

  beforeEach(() => {
    jest.useFakeTimers();
    restoreGlobals = stubGlobals({
      Cc: {
        "@mozilla.org/widget/useridleservice;1": {
          getService: () => ({ idleTime: 0 }),
        },
      },
      Ci: { nsIUserIdleService: "nsIUserIdleService" },
      Services: mockServices(["obs"]),
    });

    instance = new SystemTickFeed();
    instance.store = {
      getState() {
        return {};
      },
      dispatch: jest.fn(),
    };
  });
  afterEach(() => {
    restoreGlobals();
    jest.useRealTimers();
  });
  it("should create a SystemTickFeed", () => {
    expect(instance).toBeInstanceOf(SystemTickFeed);
  });
  it("should fire SYSTEM_TICK events at configured interval", () => {
    instance.onAction({ type: at.INIT });
    jest.advanceTimersByTime(SYSTEM_TICK_INTERVAL * 2);

    expect(instance.store.dispatch).toHaveBeenCalledTimes(2);
    expect(instance.store.dispatch).toHaveBeenNthCalledWith(1, {
      type: at.SYSTEM_TICK,
    });
    expect(instance.store.dispatch).toHaveBeenNthCalledWith(2, {
      type: at.SYSTEM_TICK,
    });
  });
  it("should not fire SYSTEM_TICK events after UNINIT", () => {
    instance.onAction({ type: at.UNINIT });
    jest.advanceTimersByTime(SYSTEM_TICK_INTERVAL * 2);

    expect(instance.store.dispatch).not.toHaveBeenCalled();
  });
  it("should not fire SYSTEM_TICK events while the user is away", () => {
    instance.onAction({ type: at.INIT });
    instance._idleService = { idleTime: SYSTEM_TICK_INTERVAL + 1 };
    jest.advanceTimersByTime(SYSTEM_TICK_INTERVAL * 3);

    expect(instance.store.dispatch).not.toHaveBeenCalled();
    instance.onAction({ type: at.UNINIT });
  });
  it("should fire SYSTEM_TICK immediately when the user is active again", () => {
    instance.onAction({ type: at.INIT });
    instance._idleService = { idleTime: SYSTEM_TICK_INTERVAL + 1 };
    jest.advanceTimersByTime(SYSTEM_TICK_INTERVAL * 3);
    instance.observe();

    expect(instance.store.dispatch).toHaveBeenCalledTimes(1);
    expect(instance.store.dispatch).toHaveBeenCalledWith({
      type: at.SYSTEM_TICK,
    });
    instance.onAction({ type: at.UNINIT });
  });
});
