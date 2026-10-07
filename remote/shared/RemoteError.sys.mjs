/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "nssErrorsService", () =>
  Cc["@mozilla.org/nss_errors_service;1"].getService(Ci.nsINSSErrorsService)
);

/**
 * Base class for all remote protocol errors.
 */
export class RemoteError extends Error {
  get isRemoteError() {
    return true;
  }

  /**
   * Convert to a serializable object. Should be implemented by subclasses.
   */
  toJSON() {
    throw new Error("Not implemented");
  }
}

/**
 * Internal class for navigation errors.
 */
export class NavigationError extends Error {
  #status;

  constructor(errorName, status) {
    super(errorName);
    this.#status = status;
  }

  get isNavigationError() {
    return true;
  }

  get isBindingAborted() {
    return this.#status == Cr.NS_BINDING_ABORTED;
  }

  get isCertError() {
    try {
      return (
        lazy.nssErrorsService.getErrorClass(this.#status) ===
        Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT
      );
    } catch {}

    return false;
  }
}
