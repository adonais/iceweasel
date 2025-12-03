/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const MODE_PREF = "browser.ipProtection.exceptionsMode";

const MODE = {
  ALL: "all",
  SELECT: "select",
};

const PERM_NAME = "ipp-vpn";

/**
 * Manages site inclusions and exclusions for IP Protection.
 * It communicates with Services.perms to update the ipp-vpn permission type.
 * Site exclusions are marked as permissions with DENY capabilities, whereas
 * site inclusions are marked as permissions with ALLOW capabilities.
 *
 * While permissions related UI (eg. panels and dialogs) already handle changes to ipp-vpn,
 * the intention of this class is to abstract methods for updating ipp-vpn as needed
 * from other non-permissions related UI.
 */
class ExceptionsManager {
  #inited = false;
  #mode = MODE.ALL;

  /**
   * The type of site exceptions for VPN.
   * Valid types are "all" and "select".
   *
   * @returns {"all" | "select"}
   *  The site exception type.
   *
   * @see MODE
   */
  get mode() {
    return this.#mode;
  }

  init() {
    if (this.#inited) {
      return;
    }

    this.#mode = this.exceptionsMode;
    this.#inited = true;
  }

  uninit() {
    if (!this.#inited) {
      return;
    }

    this.#inited = false;
  }

  onModeUpdate() {
    this.#mode = this.exceptionsMode;
  }

  /**
   * If mode is MODE.ALL, adds a new principal to ipp-vpn with DENY capability.
   * If mode is MODE.SELECT, adds a new principal to ipp-vpn with ALLOW capability.
   *
   * @param {nsIPrincipal} principal
   *  The principal that we want to add as a site exception.
   *
   * @see MODE
   */
  addException(principal) {
    if (this.#mode === MODE.ALL) {
      this.#addExclusionFromPrincipal(principal);
    } else if (this.#mode === MODE.SELECT) {
      this.#addInclusionFromPrincipal(principal);
    }
  }

  #addExclusionFromPrincipal(principal) {
    Services.perms.addFromPrincipal(
      principal,
      PERM_NAME,
      Ci.nsIPermissionManager.DENY_ACTION
    );
  }

  #addInclusionFromPrincipal(principal) {
    Services.perms.addFromPrincipal(
      principal,
      PERM_NAME,
      Ci.nsIPermissionManager.ALLOW_ACTION
    );
  }

  /**
   * Removes an existing principal from ipp-vpn.
   *
   * @param {nsIPrincipal} principal
   *  The principal that we want to remove as a site exception.
   *
   * @see MODE
   */
  removeException(principal) {
    Services.perms.removeFromPrincipal(principal, PERM_NAME);
  }

  /**
   * Get the permission object for a site exception if it is in ipp-vpn.
   *
   * @param {nsIPrincipal} principal
   *  The principal that we want to check is saved in ipp-vpn.
   *
   * @returns {nsIPermission}
   *  The permission object for a site exception, or null if unavailable.
   */
  getExceptionPermissionObject(principal) {
    let permission = Services.perms.getPermissionObject(
      principal,
      PERM_NAME,
      true /* exactHost */
    );
    return permission;
  }
}

const IPPExceptionsManager = new ExceptionsManager();

XPCOMUtils.defineLazyPreferenceGetter(
  IPPExceptionsManager,
  "exceptionsMode",
  MODE_PREF,
  MODE.ALL,
  () => IPPExceptionsManager.onModeUpdate()
);

export { IPPExceptionsManager };
