/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.labs

/**
 * Value type that represents a Firefox Labs item.
 *
 * @property slug The Nimbus slug identifying this Labs item. Used as
 * the stable identifier for telemetry and enrollment.
 * @property title The resolved title text for the item.
 * @property description The resolved description text for the item.
 * @property enrolled Whether the user is currently enrolled in this Labs item.
 * @property requiresRestart Whether toggling this item requires an application
 * restart for the change to take effect.
 * @property feedbackUrl An optional URL for sharing feedback about this item.
 * @property available Whether this item can be enabled. An item becomes unavailable when another
 * enabled Labs item already controls the same feature, or if it stops being offered after the
 * initial fetch.
 */
data class LabsItem(
    val slug: String,
    val title: String,
    val description: String,
    val enrolled: Boolean,
    val requiresRestart: Boolean,
    val feedbackUrl: String? = null,
    val available: Boolean = true,
)
