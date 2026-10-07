/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from "react-redux";
import { createStore, combineReducers } from "redux";
import { INITIAL_STATE, reducers } from "common/Reducers.sys.mjs";

export function WrapWithProvider({ children, state = INITIAL_STATE }) {
  const store = createStore(combineReducers(reducers), state);
  return <Provider store={store}>{children}</Provider>;
}

/**
 * stubGlobals - Replace properties on globalThis for the duration of a test,
 * the jest replacement for karma's GlobalOverrider. Uses property descriptors so
 * that getter-only globals can be stubbed and faithfully restored.
 *
 * @param {object} overrides Keys are global names, values the stubs to install
 * @returns {Function} restore, which puts every key back the way it was
 *                     (deleting the ones that did not exist). Call in afterEach.
 */
export function stubGlobals(overrides) {
  const originals = Object.entries(overrides).map(([key]) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]);

  for (const [key, value] of Object.entries(overrides)) {
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  return function restore() {
    for (const [key, descriptor] of originals) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete globalThis[key];
      }
    }
  };
}

// Known shapes of the `Services.*` singletons, so that every test asks for the
// same stub for a given service. Add a service here the first time a test needs
// it, with only the members that service actually exposes.
const SERVICE_STUBS = {
  appinfo: () => ({
    appBuildID: "20180710100040",
    version: "69.0a1",
    caretBlinkCount: 500,
  }),
  locale: () => ({
    appLocaleAsBCP47: "en-US",
    negotiateLanguages: jest.fn(),
  }),
  obs: () => ({
    addObserver: jest.fn(),
    removeObserver: jest.fn(),
    notifyObservers: jest.fn(),
  }),
  prefs: () => ({
    PREF_BOOL: 128,
    PREF_INT: 64,
    PREF_STRING: 32,
    addObserver: jest.fn(),
    removeObserver: jest.fn(),
    clearUserPref: jest.fn(),
    getBoolPref: jest.fn((_pref, defaultValue) => defaultValue),
    getCharPref: jest.fn((_pref, defaultValue) => defaultValue),
    getIntPref: jest.fn((_pref, defaultValue) => defaultValue),
    getStringPref: jest.fn((_pref, defaultValue) => defaultValue),
    getPrefType: jest.fn(() => 0),
    prefHasUserValue: jest.fn(() => false),
    setBoolPref: jest.fn(),
    setCharPref: jest.fn(),
    setIntPref: jest.fn(),
    setStringPref: jest.fn(),
    getDefaultBranch: jest.fn(),
  }),
  urlFormatter: () => ({
    formatURL: jest.fn(url => url),
    formatURLPref: jest.fn(pref => pref),
  }),
  // Version comparator; defaults to reporting equal versions so that
  // backward-compat gates read as supported.
  uuid: () => ({
    generateUUID: jest.fn(),
  }),
  vc: () => ({ compare: jest.fn(() => 0) }),
  scriptSecurityManager: () => ({
    createContentPrincipalFromOrigin: jest.fn(origin => ({ origin })),
  }),
  wm: () => ({
    getEnumerator: jest.fn(() => []),
  }),
};

/**
 * Builds a `Services`-shaped object holding a fresh stub per named service.
 *
 * @param {string[]} names Service names, e.g. `["obs", "wm"]`.
 * @returns {object} `{ [name]: stub }`, every member a `jest.fn()`.
 */
export function mockServices(names) {
  return Object.fromEntries(
    names.map(name => {
      const stub = SERVICE_STUBS[name];
      if (!stub) {
        throw new Error(
          `mockServices: no stub registered for Services.${name}`
        );
      }
      return [name, stub()];
    })
  );
}

export class EventEmitter {
  static decorate(objectToDecorate) {
    const emitter = new EventEmitter();
    objectToDecorate.on = emitter.on.bind(emitter);
    objectToDecorate.off = emitter.off.bind(emitter);
    objectToDecorate.once = emitter.once.bind(emitter);
    objectToDecorate.emit = emitter.emit.bind(emitter);
  }

  on(event, listener) {
    if (!this._eventEmitterListeners) {
      this._eventEmitterListeners = new Map();
    }
    if (!this._eventEmitterListeners.has(event)) {
      this._eventEmitterListeners.set(event, []);
    }
    this._eventEmitterListeners.get(event).push(listener);
  }

  off(event, listener) {
    if (!this._eventEmitterListeners) {
      return;
    }
    const listeners = this._eventEmitterListeners.get(event);
    if (listeners) {
      this._eventEmitterListeners.set(
        event,
        listeners.filter(
          l => l !== listener && l._originalListener !== listener
        )
      );
    }
  }

  once(event, listener) {
    return new Promise(resolve => {
      const handler = (_, first, ...rest) => {
        this.off(event, handler);
        if (listener) {
          listener(event, first, ...rest);
        }
        resolve(first);
      };

      handler._originalListener = listener;
      this.on(event, handler);
    });
  }

  emit(event, ...args) {
    if (
      !this._eventEmitterListeners ||
      !this._eventEmitterListeners.has(event)
    ) {
      return;
    }
    const originalListeners = this._eventEmitterListeners.get(event);
    for (const listener of this._eventEmitterListeners.get(event)) {
      if (!this._eventEmitterListeners) {
        break;
      }
      if (
        originalListeners === this._eventEmitterListeners.get(event) ||
        this._eventEmitterListeners.get(event).some(l => l === listener)
      ) {
        try {
          listener(event, ...args);
        } catch (ex) {
          // error with a listener
        }
      }
    }
  }
}
