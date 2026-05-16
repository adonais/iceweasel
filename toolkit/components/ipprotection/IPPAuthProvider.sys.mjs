/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Base class for IPProtection authentication providers.
 *
 * Subclasses should override all methods to provide a real implementation.
 * The default implementations are safe no-ops that keep the service in an
 * unauthenticated/inactive state.
 */
export class IPPAuthProvider {
  /** Returns whether the user is authenticated and ready to use the proxy. */
  get isReady() {
    return false;
  }

  /**
   * Retrieves an auth token for use with the Guardian service.
   *
   * @param {AbortSignal} [_abortSignal]
   * @returns {Promise<{token: string} & Disposable> | null}
   */
  getToken(_abortSignal) {
    return null;
  }

  /**
   * Called before the proxy starts. Should resolve enrollment and verify
   * entitlement. Returns an error object if the proxy should not start,
   * or null if everything is in order.
   *
   * @returns {Promise<{error?: string} | null>}
   */
  async aboutToStart() {
    return { error: "no_auth_provider" };
  }

  /**
   * Preference names whose values are URLs that should bypass the proxy.
   * Subclasses should override this to add auth-provider-specific exclusions.
   *
   * @returns {string[]}
   */
  get excludedUrlPrefs() {
    return [];
  }
}
