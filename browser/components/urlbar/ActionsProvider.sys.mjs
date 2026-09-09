/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A provider that matches the urlbar input to built in actions.
 */
export class ActionsProvider {
  /**
   * Unique name for the provider.
   *
   * @abstract
   * @returns {string}
   */
  get name() {
    return "ActionsProviderBase";
  }

  /**
   * Whether this provider should be invoked for the given context.
   * If this method returns false, the providers manager won't start a query
   * with this provider, to save on resources.
   *
   * @param {UrlbarQueryContext} _queryContext The query context object.
   * @returns {boolean} Whether this provider should be invoked for the search.
   * @abstract
   */
  isActive(_queryContext) {
    throw new Error("Not implemented.");
  }

  /**
   * Query for actions based on the current users input.
   *
   * @param {UrlbarQueryContext} _queryContext The query context object.
   * @returns {Promise<ActionsResult[]>}
   * @abstract
   */
  async queryActions(_queryContext) {
    throw new Error("Not implemented.");
  }

  /**
   * @param {UrlbarQueryContext} _queryContext
   * @param {UrlbarParentController} _controller
   * @param {ActionsResult} _action
   * @param {object} _details
   */
  onPick(_queryContext, _controller, _action, _details) {}
}

/**
 * Class used to create an Actions Result.
 */
export class ActionsResult {
  /**
   * @type {string}
   *   The name of the `ActionsProvider` that provided this actions result.
   */
  providerName;

  /**
   * @type {string}
   *   A string key used to distinguish between different actions.
   */
  key;

  /**
   * @type {string|undefined}
   *   The id of the l10n string displayed in the action button, if any.
   */
  l10nId;

  /**
   * @type {{[arg: string]: any}|undefined}
   *   Arguments passed to construct the above string.
   */
  l10nArgs;

  /**
   * @type {string|undefined}
   *   The icon displayed in the button; the view falls back to a default when
   *   it's absent.
   */
  icon;

  /**
   * @type {{[key: string]: any}|undefined}
   *   An object of properties we set on the action button that can be used to
   *   pass data when it is selected.
   */
  dataset;

  /**
   * @type {string|undefined}
   *   The name of an installed engine if the action prompts search mode.
   */
  engine;

  /**
   * The data is held in plain, frozen public fields (rather than getters over
   * private fields) so the result payload carrying these stays structured-
   * cloneable across the urlbar actor boundary while remaining read-only.
   *
   * @param {object} options
   *    An option object; see the field docs above. `providerName` and `key` are
   *    required; the constructor throws without them.
   * @param {string} options.providerName
   * @param {string} options.key
   * @param {string} [options.l10nId]
   * @param {{[arg: string]: any}} [options.l10nArgs]
   * @param {string} [options.icon]
   * @param {{[key: string]: any}} [options.dataset]
   * @param {string} [options.engine]
   */
  constructor({ providerName, key, l10nId, l10nArgs, icon, dataset, engine }) {
    for (let param of [providerName, key]) {
      if (!param) {
        throw new Error("ActionsResult is missing a required option");
      }
    }
    this.providerName = providerName;
    this.key = key;
    this.l10nId = l10nId;
    this.l10nArgs = l10nArgs;
    this.icon = icon;
    this.dataset = dataset;
    this.engine = engine;
    Object.freeze(this);
  }
}
