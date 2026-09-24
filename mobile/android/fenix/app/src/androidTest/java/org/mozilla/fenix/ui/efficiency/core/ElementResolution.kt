/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.core

/** The exhaustive outcome of resolving one selector. */
sealed interface ElementResolution {
    data class Found(val element: UiElement) : ElementResolution

    data object Absent : ElementResolution

    data class Unsupported(val reason: String) : ElementResolution

    data class Error(
        val cause: Throwable,
        val retryable: Boolean = cause.isTransientResolutionFailure(),
    ) : ElementResolution
}

private fun Throwable.isTransientResolutionFailure(): Boolean =
    generateSequence(this) { it.cause }
        .any {
            it is IllegalStateException && it.message.orEmpty().contains("No compose hierarchies found in the app")
        }
