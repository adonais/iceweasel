/* vim: se cin sw=2 ts=2 et filetype=javascript :
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file represents the entry point into the Taskbar Tabs system,
 * initializing necessary subsystems before the export can be used. Code driving
 * the Taskbar Tabs systems should interact with it through this interface.
 */

import {
  TaskbarTabsRegistry,
  TaskbarTabsRegistryStorage,
  kTaskbarTabsRegistryEvents,
} from "resource:///modules/taskbartabs/TaskbarTabsRegistry.sys.mjs";
import { TaskbarTabsWindowManager } from "resource:///modules/taskbartabs/TaskbarTabsWindowManager.sys.mjs";
import { TaskbarTabsPin } from "resource:///modules/taskbartabs/TaskbarTabsPin.sys.mjs";
import { TaskbarTabsUtils } from "resource:///modules/taskbartabs/TaskbarTabsUtils.sys.mjs";

/**
 * A Taskbar Tabs singleton which ensures the system has been initialized before
 * it can be interacted with. Methods on this object pass through to the Taskbar
 * Tabs registry or window manager.
 */
export const TaskbarTabs = new (class {
  #ready;
  #registry;
  #windowManager;

  constructor() {
    this.#ready = initRegistry().then(registry => {
      this.#registry = registry;
      this.#windowManager = initWindowManager(registry);
      initPinManager(registry);
    });
  }

  async getTaskbarTab(...args) {
    await this.#ready;
    return this.#registry.getTaskbarTab(...args);
  }

  async findOrCreateTaskbarTab(...args) {
    await this.#ready;
    return this.#registry.findOrCreateTaskbarTab(...args);
  }

  /**
   * Moves an existing tab into a new Taskbar Tab window.
   *
   * If there is already a Taskbar Tab for the tab's selected URL and container,
   * opens the existing Taskbar Tab. If not, a new Taskbar Tab is created.
   *
   * @param {MozTabbrowserTab} aTab - The tab to move into a Taskbar Tab window.
   * @returns {{window: DOMWindow, taskbarTab: TaskbarTab}} The created window
   * and the Taskbar Tab it is associated with.
   */
  async moveTabIntoTaskbarTab(aTab) {
    const browser = aTab.linkedBrowser;
    let url = browser.currentURI;
    let userContextId = aTab.userContextId;

    let taskbarTab = await this.findOrCreateTaskbarTab(url, userContextId);

    let win = await this.replaceTabWithWindow(taskbarTab, aTab);
    return {
      window: win,
      taskbarTab,
    };
  }

  async resetForTests(...args) {
    await this.#ready;
    return this.#registry.resetForTests(...args);
  }

  async removeTaskbarTab(...args) {
    await this.#ready;
    return this.#registry.removeTaskbarTab(...args);
  }

  async openWindow(...args) {
    await this.#ready;
    return this.#windowManager.openWindow(...args);
  }

  async replaceTabWithWindow(...args) {
    await this.#ready;
    return this.#windowManager.replaceTabWithWindow(...args);
  }

  async ejectWindow(...args) {
    await this.#ready;
    return this.#windowManager.ejectWindow(...args);
  }

  async getCountForId(...args) {
    await this.#ready;
    return this.#windowManager.getCountForId(...args);
  }
})();

/**
 * Taskbar Tabs Registry initialization.
 *
 * @returns {TaskbarTabsRegistry} A registry after loading and hooking saving to persistent storage.
 */
async function initRegistry() {
  const kRegistryFilename = "taskbartabs.json";
  // Construct the path [Profile]/taskbartabs/taskbartabs.json.
  let registryFile = TaskbarTabsUtils.getTaskbarTabsFolder();
  registryFile.append(kRegistryFilename);

  let init = {};
  if (registryFile.exists()) {
    init.loadFile = registryFile;
  }

  let registry = await TaskbarTabsRegistry.create(init);

  // Initialize persistent storage.
  let storage = new TaskbarTabsRegistryStorage(registry, registryFile);
  registry.on(kTaskbarTabsRegistryEvents.created, () => {
    storage.save();
  });
  registry.on(kTaskbarTabsRegistryEvents.patched, () => {
    storage.save();
  });
  registry.on(kTaskbarTabsRegistryEvents.removed, () => {
    storage.save();
  });

  return registry;
}

/**
 * Taskbar Tabs Window Manager initialization.
 *
 * @returns {TaskbarTabsWindowManager} The initialized Window Manager
 */
function initWindowManager() {
  let wm = new TaskbarTabsWindowManager();

  return wm;
}

/**
 * Taskbar Tabs Pinning initialization.
 *
 * @param {TaskbarTabsRegistry} aRegistry - A registry to drive events to trigger pinning.
 */
function initPinManager(aRegistry) {
  aRegistry.on(kTaskbarTabsRegistryEvents.created, (_, taskbarTab) => {
    return TaskbarTabsPin.pinTaskbarTab(taskbarTab, aRegistry);
  });
  aRegistry.on(kTaskbarTabsRegistryEvents.removed, (_, taskbarTab) => {
    return TaskbarTabsPin.unpinTaskbarTab(taskbarTab, aRegistry);
  });
}
