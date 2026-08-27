/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ASRouter: "resource:///modules/asrouter/ASRouter.sys.mjs",
  ASRouterTargeting: "resource:///modules/asrouter/ASRouterTargeting.sys.mjs",
  E10SUtils: "resource://gre/modules/E10SUtils.sys.mjs",
  SpecialMessageActions:
    "resource://messaging-system/lib/SpecialMessageActions.sys.mjs",
});

export class ASRouterNewTabMessageParent extends JSWindowActorParent {
  receiveMessage(message) {
    if (
      this.manager.remoteType !== lazy.E10SUtils.PRIVILEGEDABOUT_REMOTE_TYPE
    ) {
      return null;
    }
    switch (message.name) {
      case "SpecialMessageAction": {
        let browser = this.browsingContext.top.embedderElement;
        lazy.SpecialMessageActions.handleAction(message.data.action, browser);
        break;
      }
      case "EvaluateTargeting": {
        return this.#evaluateTargetings(message.data.targetings);
      }
    }

    return null;
  }

  /**
   * Evaluate a batch of JEXL targeting expressions against the live ASRouter
   * targeting environment and return a boolean per expression (true on targeting
   * match).
   *
   * @param {string[]} targetings One JEXL expression per state.
   * @returns {Promise<boolean[]>} One result per expression, in order.
   */
  #evaluateTargetings(targetings) {
    return Promise.all(
      targetings.map(async targeting => {
        let result = await lazy.ASRouter.evaluateExpression({
          expression: targeting,
          context: lazy.ASRouterTargeting.Environment,
        });
        if (!result.evaluationStatus.success) {
          console.error(
            `ASRouterNewTabMessage: targeting "${targeting}" failed to ` +
              `evaluate; treating as non-matching.`
          );
          return false;
        }
        return !!result.evaluationStatus.result;
      })
    );
  }
}
