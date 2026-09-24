/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.navigation

import android.content.Intent
import androidx.test.platform.app.InstrumentationRegistry
import org.mozilla.fenix.IntentReceiverActivity
import org.mozilla.fenix.helpers.DataGenerationHelper.createCustomTabIntent
import org.mozilla.fenix.helpers.MockBrowserDataHelper.createBookmarkItem

object NavigationOperations {
    fun apply(effect: NavigationEffect) {
        when (effect) {
            is NavigationEffect.CreateBookmark -> createBookmarkItem(effect.url, effect.title, effect.position)
        }
    }

    fun launchCustomTab(url: String) {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intent =
            createCustomTabIntent(url).apply {
                setClass(context, IntentReceiverActivity::class.java)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        context.startActivity(intent)
    }
}
