/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.datachoices

import mozilla.components.lib.crash.store.CrashReportOption
import mozilla.components.lib.state.State

internal data class DataChoicesState(
    val telemetryEnabled: Boolean = true,
    val usagePingEnabled: Boolean = true,
    val studiesEnabled: Boolean = true,
    val measurementDataEnabled: Boolean = true,
    val selectedCrashOption: CrashReportOption = CrashReportOption.Ask,
) : State
