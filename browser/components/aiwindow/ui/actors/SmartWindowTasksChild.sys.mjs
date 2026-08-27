/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Child actor for SmartWindowTasks to handle communication with the parent process.
 */
export class SmartWindowTasksChild extends JSWindowActorChild {
  static #VALID_EVENTS_FROM_CONTENT = new Set([
    "SmartWindowTasks:RequestListMonitors",
    "SmartWindowTasks:RequestCreateMonitor",
    "SmartWindowTasks:RequestDeleteMonitor",
    "SmartWindowTasks:RequestUpdateMonitor",
    "SmartWindowTasks:RequestRunMonitor",
    "SmartWindowTasks:RequestPauseMonitor",
    "SmartWindowTasks:RequestConstants",
  ]);

  #eventToMessageMap = new Map([
    ["SmartWindowTasks:RequestListMonitors", "SmartWindowTasks:ListMonitors"],
    ["SmartWindowTasks:RequestCreateMonitor", "SmartWindowTasks:CreateMonitor"],
    ["SmartWindowTasks:RequestDeleteMonitor", "SmartWindowTasks:DeleteMonitor"],
    ["SmartWindowTasks:RequestUpdateMonitor", "SmartWindowTasks:UpdateMonitor"],
    ["SmartWindowTasks:RequestRunMonitor", "SmartWindowTasks:RunMonitor"],
    ["SmartWindowTasks:RequestPauseMonitor", "SmartWindowTasks:PauseMonitor"],
    ["SmartWindowTasks:RequestConstants", "SmartWindowTasks:GetConstants"],
  ]);

  /**
   * Receives events from the content process and sends to the parent.
   *
   * @param {CustomEvent} event
   */
  handleEvent(event) {
    if (!SmartWindowTasksChild.#VALID_EVENTS_FROM_CONTENT.has(event.type)) {
      console.warn(
        `SmartWindowTasksChild received unknown event: ${event.type}`
      );
      return;
    }

    const messageName = this.#eventToMessageMap.get(event.type);
    if (!messageName) {
      console.warn(`No message mapping found for event: ${event.type}`);
      return;
    }

    // Send the message to the parent and handle the response
    this.sendQuery(messageName, event.detail).then(
      response => {
        // Dispatch response event back to the content
        const responseEvent = new this.contentWindow.CustomEvent(
          `${event.type}:Response`,
          {
            detail: Cu.cloneInto(response, this.contentWindow),
            bubbles: false,
          }
        );
        event.target.dispatchEvent(responseEvent);
      },
      error => {
        // Dispatch error event back to the content
        const errorEvent = new this.contentWindow.CustomEvent(
          `${event.type}:Error`,
          {
            detail: Cu.cloneInto({ error: error.message }, this.contentWindow),
            bubbles: false,
          }
        );
        event.target.dispatchEvent(errorEvent);
      }
    );
  }
}
