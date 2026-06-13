/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.logo

import android.view.ViewGroup
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.longfox.LongFoxFeatureApi

/**
 * Controller for launching the LongFox feature.
 */
class LogoController(
    private val longFoxFeature: LongFoxFeatureApi,
    private val container: ViewGroup?,
    private val longFoxEnabled: Boolean = container?.context?.settings()?.longfoxEnabled == true,
) {

    /**
     * When the longfox entry point text is clicked, launch the LongFox feature.
     */
    fun handleLongfoxEntryPointClicked() {
        if (container != null && longFoxEnabled) longFoxFeature.start(container = container)
    }
}
