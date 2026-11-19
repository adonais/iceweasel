/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global browser, ConditionBase */

/**
 * A VPN condition: matches whether IPP is proxying the page loaded in the tab.
 */
class ConditionVPN extends ConditionBase {
  #ippActive = false;
  #listener = null;

  async init() {
    await super.init();

    this.#ippActive = await this.#query();

    this.#listener = () => this.#update();
    browser.ippActivator.onIPPProxyChanged.addListener(this.#listener);
  }

  uninit() {
    if (this.#listener) {
      browser.ippActivator.onIPPProxyChanged.removeListener(this.#listener);
      this.#listener = null;
    }
    super.uninit();
  }

  check() {
    return this.#ippActive === this.desc.active;
  }

  async #update() {
    const next = await this.#query();
    if (next !== this.#ippActive) {
      this.#ippActive = next;
      this._notifyChange();
    }
  }

  #query() {
    return browser.ippActivator.isIPPActiveForTab(this.factory.context.tabId);
  }
}

globalThis.ConditionVPN = ConditionVPN;
