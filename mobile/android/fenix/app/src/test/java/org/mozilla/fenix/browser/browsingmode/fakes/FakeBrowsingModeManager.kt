/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.browser.browsingmode.fakes

import android.content.Intent
import org.mozilla.fenix.HomeActivity.Companion.PRIVATE_BROWSING_MODE
import org.mozilla.fenix.browser.browsingmode.BrowsingMode
import org.mozilla.fenix.browser.browsingmode.BrowsingModeManager

/**
 * A [BrowsingModeManager] fake that records whether [updateMode] was called and applies the same [BrowsingMode]
 * resolution as the default implementation: the [PRIVATE_BROWSING_MODE] extra when the intent carries one, otherwise
 * the mode is left as it was.
 *
 * @property mode The current [BrowsingMode].
 */
class FakeBrowsingModeManager(override var mode: BrowsingMode) : BrowsingModeManager {
    var hasModeUpdated = false

    override fun updateMode(intent: Intent?) {
        hasModeUpdated = true

        if (intent?.hasExtra(PRIVATE_BROWSING_MODE) == true) {
            mode = BrowsingMode.fromBoolean(isPrivate = intent.getBooleanExtra(PRIVATE_BROWSING_MODE, false))
        }
    }
}
