/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.media.session

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.MediaSessionState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.mediasession.MediaSession
import mozilla.components.support.test.mock
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.verify

@RunWith(AndroidJUnit4::class)
class MediaSessionCallbackTest {

    @Test
    fun `WHEN onPlay is invoked THEN forward to the active tab controller`() {
        val controller: MediaSession.Controller = mock()
        val store = storeWith(controller, MediaSession.PlaybackState.PAUSED)

        MediaSessionCallback(store).onPlay()

        verify(controller).play()
    }

    @Test
    fun `WHEN onPause is invoked THEN forward to the active tab controller`() {
        val controller: MediaSession.Controller = mock()
        val store = storeWith(controller, MediaSession.PlaybackState.PLAYING)

        MediaSessionCallback(store).onPause()

        verify(controller).pause()
    }

    @Test
    fun `WHEN onSkipToNext is invoked THEN forward to the active tab controller`() {
        val controller: MediaSession.Controller = mock()
        val store = storeWith(controller, MediaSession.PlaybackState.PLAYING)

        MediaSessionCallback(store).onSkipToNext()

        verify(controller).nextTrack()
    }

    @Test
    fun `WHEN onSkipToPrevious is invoked THEN forward to the active tab controller`() {
        val controller: MediaSession.Controller = mock()
        val store = storeWith(controller, MediaSession.PlaybackState.PLAYING)

        MediaSessionCallback(store).onSkipToPrevious()

        verify(controller).previousTrack()
    }

    private fun storeWith(
        controller: MediaSession.Controller,
        playbackState: MediaSession.PlaybackState,
    ): BrowserStore {
        val tab = createTab(
            url = "https://www.mozilla.org",
            id = "test-tab",
            mediaSessionState = MediaSessionState(controller, playbackState = playbackState),
        )
        return BrowserStore(BrowserState(tabs = listOf(tab), selectedTabId = tab.id))
    }
}
