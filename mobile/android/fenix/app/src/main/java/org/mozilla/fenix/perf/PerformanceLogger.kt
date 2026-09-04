/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.perf

import mozilla.components.support.base.log.logger.Logger

/** Shared [Logger] used by files in the performance package. */
object PerformanceLogger {
    const val TAG = "FenixPerf"
    val logger = Logger(TAG)
}
