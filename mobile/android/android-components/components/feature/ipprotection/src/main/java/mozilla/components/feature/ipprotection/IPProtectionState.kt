/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.ipprotection

import mozilla.components.lib.state.State

/**
 * Holds all IPProtection-related state surfaced by the GeckoView VPN proxy.
 *
 * @property status Current connection state of the IP protection proxy.
 * @property dataRemainingBytes Remaining monthly data allowance in bytes, or -1 if unavailable.
 * @property dataMaxBytes Maximum monthly data allowance in bytes, or -1 if unavailable.
 * @property resetDate ISO 8601 string for when the monthly allowance resets, or null if unavailable.
 * @property isEnrollmentNeeded True when the user is authenticated with Firefox Account but Guardian
 * has not yet enrolled.
 */
data class IPProtectionState(
    val status: IPProtectionStatus = IPProtectionStatus.NotAvailable,
    val dataRemainingBytes: Long = -1L,
    val dataMaxBytes: Long = -1L,
    val resetDate: String? = null,
    val isEnrollmentNeeded: Boolean = false,
) : State
