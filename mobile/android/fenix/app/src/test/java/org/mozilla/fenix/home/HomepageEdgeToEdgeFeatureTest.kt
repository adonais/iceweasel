/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home

import android.app.Activity
import android.view.ViewGroup
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.compose.browser.toolbar.store.BrowserToolbarStore
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.mozilla.fenix.browser.browsingmode.BrowsingMode
import org.mozilla.fenix.browser.browsingmode.BrowsingModeManager
import org.mozilla.fenix.components.AppStore
import org.mozilla.fenix.components.appstate.AppAction
import org.mozilla.fenix.utils.Settings
import org.mozilla.fenix.wallpapers.Wallpaper
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class HomepageEdgeToEdgeFeatureTest {

    private val testDispatcher = StandardTestDispatcher()
    private val settings: Settings = mockk(relaxed = true)
    private val browsingModeManager: BrowsingModeManager = mockk(relaxed = true) {
        every { mode } returns BrowsingMode.Normal
    }

    @Test
    fun `GIVEN feature is disabled WHEN feature starts THEN wallpaper updates are not observed`() = runTest(testDispatcher) {
        every { settings.enableHomepageEdgeToEdgeBackgroundFeature } returns false
        val activity = Robolectric.buildActivity(Activity::class.java).create().get()
        val decorView = activity.window.decorView as ViewGroup
        val initialChildCount = decorView.childCount
        val appStore = AppStore()

        HomepageEdgeToEdgeFeature(
            appStore = appStore,
            activity = activity,
            settings = settings,
            browsingModeManager = browsingModeManager,
            toolbarStore = BrowserToolbarStore(),
            mainDispatcher = testDispatcher,
        ).start()
        testScheduler.advanceUntilIdle()
        appStore.dispatch(AppAction.WallpaperAction.UpdateCurrentWallpaper(Wallpaper.EdgeToEdge))
        testScheduler.advanceUntilIdle()

        assertEquals(initialChildCount, decorView.childCount)
    }

    @Test
    fun `GIVEN feature is enabled WHEN EdgeToEdge wallpaper is selected THEN status bar background is added`() = runTest(testDispatcher) {
        every { settings.enableHomepageEdgeToEdgeBackgroundFeature } returns true
        every { settings.shouldUseBottomToolbar } returns false
        val activity = Robolectric.buildActivity(Activity::class.java).create().get()
        val decorView = activity.window.decorView as ViewGroup
        val initialChildCount = decorView.childCount
        val appStore = AppStore()
        appStore.dispatch(AppAction.WallpaperAction.UpdateCurrentWallpaper(Wallpaper.EdgeToEdge))

        HomepageEdgeToEdgeFeature(
            appStore = appStore,
            activity = activity,
            settings = settings,
            browsingModeManager = browsingModeManager,
            toolbarStore = BrowserToolbarStore(),
            mainDispatcher = testDispatcher,
        ).start()
        testScheduler.advanceUntilIdle()

        assertEquals(initialChildCount + 1, decorView.childCount)
        ViewCompat.dispatchApplyWindowInsets(
            decorView.getChildAt(initialChildCount),
            WindowInsetsCompat.Builder()
                .setInsets(WindowInsetsCompat.Type.statusBars(), Insets.of(0, 1, 0, 0))
                .build(),
        )
        assertEquals(
            R.drawable.home_background_gradient,
            shadowOf(shadowOf(activity.window).backgroundDrawable).createdFromResId,
        )
    }
}
