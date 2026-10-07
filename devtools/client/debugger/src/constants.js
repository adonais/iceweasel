/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

export const searchKeys = {
  PROJECT_SEARCH: "project-search",
  FILE_SEARCH: "file-search",
  QUICKOPEN_SEARCH: "quickopen-search",
};

export const primaryPaneTabs = {
  SOURCES: "sources",
  OUTLINE: "outline",
  PROJECT_SEARCH: "project",
  TRACER: "tracer",
};

export const sourceTree = {
  /**
   * Sources tree reducer
   *
   * A Source Tree is composed of:
   *
   *  - Thread Items to designate targets/threads.
   *    These are the roots of the Tree if no project directory is selected.
   *
   *  - Group Items to designate the different domains used in the website.
   *    These are direct children of threads and may contain directory or source items.
   *
   *  - Directory Items to designate all the folders.
   *    Note that each folder has an item. The Source Tree React component is doing the magic to coalesce folders made of only one sub folder.
   *
   *  - Source Items to designate sources.
   *    They are the leaves of the Tree. (we should not have empty directories.
   */
  itemTypes: {
    THREAD: "thread",
    DIRECTORY: "directory",
    GROUP: "group",
    SOURCE: "source",
  },
};
