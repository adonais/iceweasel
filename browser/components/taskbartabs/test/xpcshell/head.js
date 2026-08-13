/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const head = {};
ChromeUtils.defineESModuleGetters(head, {
  TaskbarTabsRegistry:
    "resource:///modules/taskbartabs/TaskbarTabsRegistry.sys.mjs",
});

/**
 * Creates a new Taskbar Tab within the registry, and asserts that it does not
 * already exist.
 *
 * (This function is also in browser/head.js.)
 *
 * @param {TaskbarTabsRegistry|TaskbarTabs} aRegistry
 *   The registry to create the taskbar tab in.
 * @param {...*} args
 *   Arguments to findOrCreateTaskbarTab.
 * @returns {TaskbarTab}
 *   The newly-created taskbar tab.
 */
function createTaskbarTab(aRegistry, ...args) {
  let result = aRegistry.findOrCreateTaskbarTab(...args);
  function check({ taskbarTab, created }) {
    Assert.ok(created, "Created taskbar tab did not exist before");
    return taskbarTab;
  }

  if (result.then) {
    return result.then(check);
  }

  return check(result);
}

/**
 * Creates a TaskbarTabsRegistry that doesn't save anything on disk.
 *
 * (This function is also in browser/head.js.)
 *
 * @returns {TaskbarTabsRegistry}
 *   The newly-created registry, which will be empty.
 */
function createInMemoryRegistry() {
  return new head.TaskbarTabsRegistry(
    {
      save: () => {},
    },
    []
  );
}
