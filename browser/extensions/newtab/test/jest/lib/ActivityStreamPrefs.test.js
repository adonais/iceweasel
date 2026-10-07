/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { stubGlobals } from "test/jest/test-utils";

const TEST_PREF_CONFIG = new Map([
  ["foo", { value: true }],
  ["bar", { value: "BAR" }],
  ["baz", { value: 1 }],
  ["qux", { value: "foo", value_local_dev: "foofoo" }],
]);

const AppConstants = { MOZILLA_OFFICIAL: true };

// Just enough of Preferences.sys.mjs for the two subclasses under test: an
// in-memory pref map plus the members they call on `super`.
class FakePreferences {
  constructor({ defaultBranch } = {}) {
    this.prefs = new Map();
    this.defaultBranch = Boolean(defaultBranch);
    this._prefBranch = { addObserver() {}, removeObserver() {} };
  }
  get(prefName, defaultValue) {
    const value = this.prefs.get(prefName);
    return value === undefined ? defaultValue : value;
  }
  set(prefName, value) {
    this.prefs.set(prefName, value);
  }
  observe() {}
}

describe("ActivityStreamPrefs", () => {
  let DefaultPrefs;
  let Prefs;
  let restoreChromeUtils;

  // ActivityStreamPrefs.sys.mjs resolves AppConstants and its Preferences base
  // class through ChromeUtils.importESModule at load time, so the global has to
  // exist before the module is evaluated.
  beforeAll(async () => {
    restoreChromeUtils = stubGlobals({
      ChromeUtils: {
        importESModule: () => ({
          AppConstants,
          Preferences: FakePreferences,
        }),
      },
    });
    ({ DefaultPrefs, Prefs } = await import("lib/ActivityStreamPrefs.sys.mjs"));
  });

  afterAll(() => {
    restoreChromeUtils();
  });

  beforeEach(() => {
    AppConstants.MOZILLA_OFFICIAL = true;
  });

  describe("Prefs", () => {
    let p;
    beforeEach(() => {
      p = new Prefs();
    });
    it("should have get, set, and observe methods", () => {
      expect(p.get).toBeDefined();
      expect(p.set).toBeDefined();
      expect(p.observe).toBeDefined();
    });
    describe("#observeBranch", () => {
      let listener;
      beforeEach(() => {
        p._prefBranch = { addObserver: jest.fn() };
        listener = { onPrefChanged: jest.fn() };
        p.observeBranch(listener);
      });
      it("should add an observer", () => {
        expect(p._prefBranch.addObserver).toHaveBeenCalledTimes(1);
        expect(p._prefBranch.addObserver).toHaveBeenCalledWith(
          "",
          expect.any(Function)
        );
      });
      it("should store the listener", () => {
        expect(p._branchObservers.size).toEqual(1);
        expect(p._branchObservers.has(listener)).toBe(true);
      });
      it("should call listener's onPrefChanged", () => {
        p._branchObservers.get(listener)();

        expect(listener.onPrefChanged).toHaveBeenCalledTimes(1);
      });
    });
    describe("#ignoreBranch", () => {
      let listener;
      beforeEach(() => {
        p._prefBranch = {
          addObserver: jest.fn(),
          removeObserver: jest.fn(),
        };
        listener = {};
        p.observeBranch(listener);
      });
      it("should remove the observer", () => {
        p.ignoreBranch(listener);

        expect(p._prefBranch.removeObserver).toHaveBeenCalledTimes(1);
        expect(p._prefBranch.removeObserver).toHaveBeenCalledWith(
          p._prefBranch.addObserver.mock.calls[0][0],
          expect.any(Function)
        );
      });
      it("should remove the listener", () => {
        expect(p._branchObservers.size).toEqual(1);

        p.ignoreBranch(listener);

        expect(p._branchObservers.size).toEqual(0);
      });
    });
  });

  describe("DefaultPrefs", () => {
    describe("#init", () => {
      let defaultPrefs;
      let setStub;
      beforeEach(() => {
        defaultPrefs = new DefaultPrefs(TEST_PREF_CONFIG);
        setStub = jest
          .spyOn(defaultPrefs, "set")
          .mockImplementation(() => undefined);
      });
      afterEach(() => {
        setStub.mockRestore();
      });
      it("should initialize a boolean pref", () => {
        defaultPrefs.init();
        expect(defaultPrefs.set).toHaveBeenCalledWith("foo", true);
      });
      it("should not initialize a pref if a default exists", () => {
        defaultPrefs.prefs.set("foo", false);

        defaultPrefs.init();

        expect(defaultPrefs.set).not.toHaveBeenCalledWith("foo", true);
      });
      it("should initialize a string pref", () => {
        defaultPrefs.init();
        expect(defaultPrefs.set).toHaveBeenCalledWith("bar", "BAR");
      });
      it("should initialize a integer pref", () => {
        defaultPrefs.init();
        expect(defaultPrefs.set).toHaveBeenCalledWith("baz", 1);
      });
      it("should initialize a pref with value if Firefox is not a local build", () => {
        defaultPrefs.init();
        expect(defaultPrefs.set).toHaveBeenCalledWith("qux", "foo");
      });
      it("should initialize a pref with value_local_dev if Firefox is a local build", () => {
        AppConstants.MOZILLA_OFFICIAL = false;
        defaultPrefs.init();
        expect(defaultPrefs.set).toHaveBeenCalledWith("qux", "foofoo");
      });
    });
  });
});
