/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.support.rusterrors

import mozilla.appservices.errorsupport.RustComponentsErrorTelemetry

/**
 * Report a Rust component error
 *
 * This is used when the Kotlin code sees an error in Rust that Rust can't report itself, for
 * example a UniFFI InternalException.
 */
fun reportRustError(typeName: String, exception: Throwable) {
    RustComponentsErrorTelemetry.submitErrorPing(typeName, exception.toString())
}
