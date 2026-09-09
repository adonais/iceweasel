/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.intent

import android.content.Intent
import androidx.navigation.NavController
import mozilla.components.concept.engine.EngineSession
import org.mozilla.fenix.BrowserDirection
import org.mozilla.fenix.HomeActivity
import org.mozilla.fenix.utils.Settings

/**
 * The search widget's Google Lens button captures an image (or scans a QR code) in
 * [org.mozilla.fenix.widget.LensSearchActivity], which forwards the resulting URL here via
 * [HomeActivity.LENS_RESULT_URL] so it can be opened in the browser. Unlike [SpeechProcessingIntentProcessor], the
 * payload is a URL to load (or text to search), not a forced search term.
 */
class LensResultIntentProcessor(private val activity: HomeActivity) : HomeIntentProcessor {

    override fun process(intent: Intent, navController: NavController, out: Intent, settings: Settings): Boolean {
        val resultUrl = intent.getStringExtra(HomeActivity.LENS_RESULT_URL)
        if (resultUrl.isNullOrEmpty() || !intent.getBooleanExtra(HomeActivity.OPEN_TO_BROWSER_AND_LOAD, false)) {
            return false
        }

        out.putExtra(HomeActivity.OPEN_TO_BROWSER_AND_LOAD, false)

        @Suppress("DEPRECATION")
        activity.openToBrowserAndLoad(
            searchTermOrURL = resultUrl,
            newTab = true,
            from = BrowserDirection.FromGlobal,
            forceSearch = false,
            flags = EngineSession.LoadUrlFlags.external(),
        )

        return true
    }
}
