/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.helpers

enum class StateCaptureCost {
    IN_MEMORY,
    STORAGE_IO,
    PACKAGE_MANAGER,
}

enum class StateSensitivity {
    NONE,
    AGGREGATE_ONLY,
}

enum class StateResourcePolicy {
    OBSERVE,
    RESTORE,
    PRESERVE,
    UNSUPPORTED,
}

interface StateContributor {
    val name: String
    val schemaVersion: Int
    val fields: Set<String>
    val captureCost: StateCaptureCost
    val sensitivity: StateSensitivity
    val policy: StateResourcePolicy
    val includeInCompatibilityState: Boolean
    val boundaryBaseline: Map<String, Any?>
    val controlDrivers: Set<String>

    fun capture(): Map<String, Any?>
}

data class StateContribution(
    val name: String,
    val schemaVersion: Int,
    val captureCost: StateCaptureCost,
    val sensitivity: StateSensitivity,
    val policy: StateResourcePolicy,
    val includeInCompatibilityState: Boolean,
    val boundaryBaseline: Map<String, Any?>,
    val controlDrivers: Set<String>,
    val values: Map<String, Any?>,
) {
    fun asRecord(): Map<String, Any?> =
        mapOf(
            "name" to name,
            "schemaVersion" to schemaVersion,
            "captureCost" to captureCost.name,
            "sensitivity" to sensitivity.name,
            "includeInCompatibilityState" to includeInCompatibilityState,
            "boundaryPolicy" to if (boundaryBaseline.isEmpty()) "OBSERVE" else "ENFORCE",
            "resourcePolicy" to policy.name,
            "boundaryBaseline" to boundaryBaseline,
            "controlDrivers" to controlDrivers.sorted(),
            "complete" to values.values.none { it is String && it.startsWith("unreadable:") },
            "values" to values,
        )
}

data class StateSnapshot(
    val values: Map<String, Any?>,
    val contributions: List<StateContribution>,
)
