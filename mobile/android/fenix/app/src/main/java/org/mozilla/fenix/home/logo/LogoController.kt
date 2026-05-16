/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.logo

import android.view.ViewGroup
import org.mozilla.fenix.ext.settings
import org.mozilla.fenix.longfox.LongFoxFeatureApi

/**
 * Wire up clicks on the home screen logo to the long fox feature, if enabled.
 */
class LogoController(
    private val longFoxFeature: LongFoxFeatureApi,
    private val container: ViewGroup?,
    private val longFoxEnabled: Boolean = container?.context?.settings()?.longfoxEnabled == true,
) {

    /**
     * When the logo is long clicked, decide whether to launch the LongFox feature.
     */
    fun handleLogoLongClicked() {
        if (container != null && longFoxEnabled) longFoxFeature.start(container = container)
    }
}
