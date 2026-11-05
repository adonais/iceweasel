/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  isAllowedWatchUrl:
    "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs",
  TOTAL_NUM_URLS_IN_MONITOR:
    "moz-src:///browser/components/aiwindow/models/agents/Monitor.sys.mjs",
  MonitorUIUtils:
    "moz-src:///browser/components/aiwindow/ui/modules/MonitorUIUtils.sys.mjs",
});

/**
 * Resolves privileged data for agent-monitor-item cards on behalf of
 * AgentMonitorItemChild.
 */
export class AgentMonitorItemParent extends JSWindowActorParent {
  receiveMessage({ name, data }) {
    if (name === "AgentMonitorItem:ResolveTitles") {
      // The child is content, so only look up as many watchable pages as one
      // monitor can hold
      const urls = (Array.isArray(data?.urls) ? data.urls : [])
        .filter(url => typeof url === "string" && lazy.isAllowedWatchUrl(url))
        .slice(0, lazy.TOTAL_NUM_URLS_IN_MONITOR);
      return lazy.MonitorUIUtils.resolveWatchUrlTitles(urls);
    }
    console.warn(`AgentMonitorItemParent received unknown message: ${name}`);
    return undefined;
  }
}
