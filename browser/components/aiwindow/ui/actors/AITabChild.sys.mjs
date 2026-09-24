/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const REQUEST_PAGE_EVENT = "AITab:RequestPage";

/**
 * Child actor for about:aitab. Forwards page lookups from the content document
 * to the parent process and dispatches the answer back to the requester.
 */
export class AITabChild extends JSWindowActorChild {
  handleEvent(event) {
    if (event.type != REQUEST_PAGE_EVENT) {
      console.warn(`AITabChild received unknown event: ${event.type}`);
      return;
    }

    this.sendQuery("AITab:GetPage", event.detail)
      .then(
        response => this.#respond(event, "Response", response),
        error => this.#respond(event, "Error", { error: error.message })
      )
      .catch(error => {
        console.error("Could not answer an AI Tab page request", error);
      });
  }

  #respond(event, suffix, detail) {
    // The page can go away while the query is in flight.
    if (!this.contentWindow) {
      return;
    }
    event.target.dispatchEvent(
      new this.contentWindow.CustomEvent(`${event.type}:${suffix}`, {
        detail: Cu.cloneInto(detail, this.contentWindow),
        bubbles: false,
      })
    );
  }
}
