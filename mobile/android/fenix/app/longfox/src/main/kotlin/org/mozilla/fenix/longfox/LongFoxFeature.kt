/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

package org.mozilla.fenix.longfox

import android.view.ViewGroup
import androidx.activity.compose.BackHandler
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy

/**
 * Defines the api for using Long Fox.
 */
interface LongFoxFeatureApi {

    /**
     * If you want to include the game somewhere, call this with a view you want to attach it to.
     * @param container the view that you want to put the game in
     */
    fun start(container: ViewGroup)
}

/**
 * Initialises Long Fox feature 🟧🟧🟧🟧🦊
 *
 */
class LongFoxFeature : LongFoxFeatureApi {

    /**
     *  Adds a compose view with the game to whichever view is passed in.
     *  When back is pressed, gets rid of this game ComposeView.
     *  @param container the view that you want to put the game in.
     */
    override fun start(container: ViewGroup) {
        val context = container.context ?: return
        container.addView(
            ComposeView(context).apply {
                setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
                setContent {
                    MaterialTheme {
                        LongFoxGameScreen()
                    }
                    BackHandler {
                        container.removeView(this)
                        disposeComposition()
                    }
                }
            },
        )
    }
}
