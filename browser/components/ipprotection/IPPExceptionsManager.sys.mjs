/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PERM_NAME = "ipp-vpn";

/**
 * Manages site exceptions for IP Protection.
 * It communicates with Services.perms to update the ipp-vpn permission type.
 * Site exclusions are marked as permissions with DENY capabilities.
 *
 * While permissions related UI (eg. panels and dialogs) already handle changes to ipp-vpn,
 * the intention of this class is to abstract methods for updating ipp-vpn as needed
 * from other non-permissions related UI.
 */
class ExceptionsManager {
  #inited = false;

  init() {
    if (this.#inited) {
      return;
    }

    this.#inited = true;
  }

  uninit() {
    if (!this.#inited) {
      return;
    }

    this.#inited = false;
  }

  /**
   * Adds a principal to ipp-vpn with capability DENY_ACTION
   * for site exclusions.
   *
   * @param {nsIPrincipal} principal
   *  The principal that we want to add as a site exception.
   */
  addExclusion(principal) {
    Services.perms.addFromPrincipal(
      principal,
      PERM_NAME,
      Ci.nsIPermissionManager.DENY_ACTION
    );
  }

  /**
   * Removes an existing principal from ipp-vpn.
   *
   * @param {nsIPrincipal} principal
   *  The principal that we want to remove as a site exception.
   */
  removeExclusion(principal) {
    Services.perms.removeFromPrincipal(principal, PERM_NAME);
  }

  /**
   * Returns true if the principal already exists in ipp-vpn
   * and is registered as a permission with a DENY_ACTION
   * capability (site exclusions).
   * Else returns false if no such principal exists.
   *
   * @param {nsIPrincipal} principal
   *  The principal that we want to check is saved in ipp-vpn
   *  as a site exclusion.
   * @returns {boolean}
   *  True if the principal exists as a site exclusion.
   */
  hasExclusion(principal) {
    let permission = this.getExceptionPermissionObject(principal);
    return permission?.capability === Ci.nsIPermissionManager.DENY_ACTION;
  }

  /**
   * Get the permission object for a site exception if it exists in ipp-vpn.
   *
   * @param {nsIPrincipal} principal
   *  The principal that we want to check is saved in ipp-vpn.
   *
   * @returns {nsIPermission}
   *  The permission object for a site exception, or null if unavailable.
   */
  getExceptionPermissionObject(principal) {
    let permissionObject = Services.perms.getPermissionObject(
      principal,
      PERM_NAME,
      true /* exactHost */
    );
    return permissionObject;
  }
}

const IPPExceptionsManager = new ExceptionsManager();
export { IPPExceptionsManager };
