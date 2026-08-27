/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class ASRouterNewTabMessageChild extends JSWindowActorChild {
  handleEvent(event) {
    switch (event.type) {
      case "ASRouterNewTabMessage:SpecialMessageAction": {
        this.sendAsyncMessage("SpecialMessageAction", event.detail);
        break;
      }
      case "ASRouterNewTabMessage:EvaluateTargeting": {
        this.#enqueueTargetingEvaluation(event.target, event.detail);
        break;
      }
    }
  }

  /**
   * Asks the parent to evaluate the element's state targeting expressions, then
   * sets the index of the first matching state back into the element via its
   * setMatchedState() method.
   *
   * @param {Element} el The <asrouter-newtab-message> element that requested
   *   the evaluation.
   * @param {object} detail The event detail (content object) carrying
   *   `targetings`, one JEXL expression per state.
   */
  async #enqueueTargetingEvaluation(el, detail) {
    const targetings = Array.from(Cu.waiveXrays(detail).targetings);

    let results;
    try {
      results = await this.sendQuery("EvaluateTargeting", { targetings });
    } catch {
      // The actor can be torn down (tab close, navigation) while a query is in
      // flight - with a recurring poll that window is hit routinely. That
      // rejection is expected, so swallow it.
      return;
    }

    // The element may have been dismissed or the page torn down while the
    // query was in flight.
    if (!results || !el.isConnected) {
      return;
    }
    // Compute the first matching state here and set its index on the element.
    Cu.waiveXrays(el).setMatchedState(results.findIndex(Boolean));
  }
}
