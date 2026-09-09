/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.pdf

/** The type of signature to add to a PDF. */
internal sealed interface SignatureType {
    /** The telemetry name to use for reporting. */
    val telemetryName: String

    /** The user typed the signature using keyboard input. */
    data object Typed : SignatureType {
        override val telemetryName = "typed"
    }
}
