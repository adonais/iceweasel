/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { UrlbarShared } from "./UrlbarShared.mjs";

const logger = UrlbarShared.getLogger({ prefix: "SearchEngineStore" });

/**
 * @typedef {object} SearchEngineInfo
 *   Serializable information about search engines
 *   used to construct PartialSearchEngines.
 *
 * @property {string} id
 *   The engine's id.
 * @property {string} name
 *   The engine's name.
 * @property {boolean} isConfigEngine
 *   Whether the engine is a ConfigSearchEngine.
 * @property {boolean} isAppProvided
 *   Whether the engine is an AppProvidedConfigEngine.
 * @property {boolean} isGeneralPurposeEngine
 *   See SearchEngine::isGeneralPurposeEngine.
 * @property {boolean} hideOneOffButton
 *   Whether to hide the engine in the search mode switcher popup.
 * @property {string} isNewUntil
 *   The date until which the engine is considered new (format: YYYY-MM-DD).
 * @property {string[]} aliases
 *   Array of the engine's aliases.
 */

/**
 * A lightweight view of a SearchEngine for use with SearchEngineStore.
 */
export class PartialSearchEngine {
  /** @type {UrlbarChildController} */
  #controller;

  /**
   * @param {SearchEngineInfo} engineInfo
   * @param {UrlbarChildController} controller
   */
  constructor(engineInfo, controller) {
    this.#controller = controller;
    this.id = engineInfo.id;
    this.name = engineInfo.name;
    this.isConfigEngine = engineInfo.isConfigEngine;
    this.isAppProvided = engineInfo.isAppProvided;
    this.isGeneralPurposeEngine = engineInfo.isGeneralPurposeEngine;
    this.isNewUntil = engineInfo.isNewUntil;
    this.hideOneOffButton = engineInfo.hideOneOffButton;
    this.aliases = engineInfo.aliases;
  }

  /**
   * The cached icon URL: a uri string if the engine has an icon, null
   * if it has no icon, or undefined if it hasn't been looked up yet.
   *
   * @type {string|null|undefined}
   */
  #icon;

  /**
   * Returns the engine's icon URL, caching it after the first lookup.
   *
   * @returns {Promise<?string>}
   *   The icon URL, or null if the engine or its icon could not be found.
   */
  async getIconURL() {
    if (this.#icon === undefined) {
      this.#icon =
        (await this.#controller.parentController.getEngineIconURL(this.id)) ??
        null;
    }
    return this.#icon;
  }

  /**
   * Whether the engine should be presented as new, per its isNewUntil date.
   *
   * @returns {boolean}
   */
  isNew() {
    if (!this.isNewUntil) {
      return false;
    }
    let today = new Date().toISOString().slice(0, 10);
    return today <= this.isNewUntil;
  }

  /**
   * Drops the cached icon so it is fetched again on the next getIconURL call.
   */
  invalidateIcon() {
    this.#icon = undefined;
  }

  /**
   * Marks an engine as used if it's not marked already.
   */
  markAsUsed() {
    this.#controller.parentController.markEngineAsUsed(this.id);
  }
}

/**
 * An in-memory cache of the visible search engines, kept up to date through
 * search service notifications. It can be used as a replacement for the search
 * service outside the parent process.
 */
export class SearchEngineStore {
  /** Whether the store successfully finished initializing. */
  initialized = false;
  /** Whether the store failed initializing. */
  failed = false;

  #initPromiseWithResolvers = Promise.withResolvers();
  /** @type {PartialSearchEngine[]} */
  #store = [];
  /** @type {?PartialSearchEngine} */
  #defaultEngine = null;
  #controller;
  /** @type {((modifiedType: "removed"|"changed"|"default", engine: PartialSearchEngine) => void)[]} */
  #observers = [];

  /**
   * @param {UrlbarChildController} controller
   */
  constructor(controller) {
    this.#controller = controller;
    this.isPrivate = controller.input.isPrivate;
  }

  /**
   * Request initialization and wait until it finishes.
   *
   * @returns {Promise<void>}
   *   Resolves once the store has received its initial state,
   *   rejects if the search service failed.
   */
  init() {
    if (!this.initialized && !this.failed) {
      // Requesting init multiple times is fine.
      this.#controller.parentController.initEngineStore();
    }
    return this.#initPromiseWithResolvers.promise;
  }

  /**
   * The default engine, or null if the store hasn't
   * been initialized successfully (yet).
   *
   * @returns {?PartialSearchEngine}
   */
  get default() {
    return this.#defaultEngine;
  }

  /**
   * @param {string} id
   * @returns {PartialSearchEngine|undefined}
   */
  getEngine(id) {
    return this.#store.find(e => e.id == id);
  }

  /**
   * All engines, in display order.
   *
   * @returns {PartialSearchEngine[]}
   */
  getEngines() {
    if (!this.initialized) {
      throw new Error("Engine store is not initialized");
    }

    return this.#store;
  }

  /**
   * @param {string} engineName
   * @returns {PartialSearchEngine|undefined}
   */
  getEngineByName(engineName) {
    return this.#store.find(e => e.name == engineName);
  }

  /**
   * @param {(modifiedType: "removed"|"changed"|"default", engine: PartialSearchEngine) => void} observer
   */
  addObserver(observer) {
    if (!this.#observers.includes(observer)) {
      this.#observers.push(observer);
    }
  }

  /**
   * @param {(modifiedType: "removed"|"changed"|"default", engine: PartialSearchEngine) => void} observer
   */
  removeObserver(observer) {
    let index = this.#observers.findIndex(o => o == observer);
    if (index != -1) {
      this.#observers.splice(index, 1);
    }
  }

  /**
   * Handle a message from the parent process.
   *
   * @param {"init"|"error"|"removed"|"changed"|"default"} kind
   * @param  {any[]} args
   */
  receive(kind, ...args) {
    switch (kind) {
      case "init":
        // @ts-ignore
        this.#handleInit(...args);
        break;
      case "error":
        this.#handleError();
        break;
      case "removed":
      case "changed":
      case "default":
        // @ts-ignore
        this.#handleUpdate(kind, ...args);
        break;
    }
  }

  /**
   * Initializes the store with a full snapshot of the search service state.
   *
   * @param {SearchEngineInfo[]} engineInfos
   *   All visible engines, in display order.
   * @param {number} defaultIndex
   *   The index of the default engine within engineInfos.
   */
  #handleInit(engineInfos, defaultIndex) {
    if (this.initialized) {
      throw new Error("#handleInit called after the store was initialized");
    }

    for (let engineInfo of engineInfos) {
      this.#store.push(new PartialSearchEngine(engineInfo, this.#controller));
    }
    this.#defaultEngine = this.#store[defaultIndex];

    this.initialized = true;
    this.#initPromiseWithResolvers.resolve();
  }

  /**
   * Initializes the store with an error that will never be recovered from.
   * This happens if the search service failed.
   */
  #handleError() {
    if (this.initialized) {
      throw new Error("#handleError called after the store was initialized");
    }
    this.failed = true;
    this.#initPromiseWithResolvers.reject(
      new Error("Engine store failed to initialize")
    );
  }

  /**
   * Applies a single engine change to the store and notifies observers.
   * A "changed" update for an engine not already in the store inserts it.
   *
   * @param {"removed"|"changed"|"default"} modifiedType
   *   The kind of change that occurred.
   * @param {SearchEngineInfo} engineInfo
   *   The engine the change applies to.
   * @param {number} newIndex
   *   The engine's index in display order after the change.
   *   Unused for "removed", can be -1 for new engines.
   */
  #handleUpdate(modifiedType, engineInfo, newIndex) {
    if (!this.initialized) {
      throw new Error("#handleUpdate called before the store was initialized");
    }

    let currentIndex = this.#store.findIndex(e => e.id == engineInfo.id);

    switch (modifiedType) {
      case "removed": {
        if (currentIndex != -1) {
          let [engine] = this.#store.splice(currentIndex, 1);
          this.#notifyObservers(modifiedType, engine);
        }
        break;
      }
      case "changed": {
        if (currentIndex == -1) {
          // Add new engine.
          let newEngine = new PartialSearchEngine(engineInfo, this.#controller);
          if (newIndex == -1) {
            this.#store.push(newEngine);
          } else {
            this.#store.splice(newIndex, 0, newEngine);
          }
          this.#notifyObservers(modifiedType, newEngine);
          break;
        }

        // Update existing engine.
        let engine = this.#store[currentIndex];
        if (newIndex != currentIndex) {
          this.#store.splice(currentIndex, 1);
          this.#store.splice(newIndex, 0, engine);
        }
        for (let key of Object.keys(engineInfo)) {
          engine[key] = engineInfo[key];
        }
        engine.invalidateIcon();
        this.#notifyObservers(modifiedType, engine);
        break;
      }
      case "default": {
        if (currentIndex == -1) {
          logger.warn(
            "New default engine is not in engine store, ignoring notification."
          );
          return;
        }
        this.#defaultEngine = this.#store[currentIndex];
        this.#notifyObservers(modifiedType, this.#defaultEngine);
        break;
      }
    }
  }

  /**
   * @param {"removed"|"changed"|"default"} modifiedType
   *   The kind of change that occurred.
   * @param {PartialSearchEngine} engine
   *   The engine the change applies to.
   */
  #notifyObservers(modifiedType, engine) {
    for (let observer of this.#observers) {
      observer(modifiedType, engine);
    }
  }
}
