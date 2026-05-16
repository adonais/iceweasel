/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.ipprotection

/** Represents the possible states of the IPProtection proxy. */
enum class IPProtectionStatus {
    /** Active and routing traffic. */
    Active,

    /** In the process of connecting. */
    Activating,

    /** Authenticated and ready to be activated. */
    Ready,

    /** Paused, because the monthly data quota has been exhausted. */
    Paused,

    /** Encountered an error and could not activate or stay active. */
    Error,

    /** Not available, e.g. the user is not signed in or not authorized IPProtection yet. */
    NotAvailable,
}
