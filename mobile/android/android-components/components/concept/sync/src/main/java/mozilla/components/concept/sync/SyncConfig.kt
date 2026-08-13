/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.concept.sync

/**
 * @property periodMinutes How frequently periodic sync should happen.
 * @property initialDelayMinutes What should the initial delay for the periodic sync be.
 */
data class PeriodicSyncConfig(
    val periodMinutes: Int = 240,
    val initialDelayMinutes: Int = 5,
)

/**
 * Configuration for sync.
 *
 * @property supportedEngines A set of supported sync engines.
 * @property periodicSyncConfig Optional configuration for running sync periodically.
 * Periodic sync is disabled if this is `null`.
 */
data class SyncConfig(
    val supportedEngines: Set<SyncEngine>,
    val periodicSyncConfig: PeriodicSyncConfig?,
)
