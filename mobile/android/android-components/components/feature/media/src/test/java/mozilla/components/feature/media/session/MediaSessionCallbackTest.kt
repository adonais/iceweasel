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
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.doAnswer
import org.mockito.Mockito.never
import org.mockito.Mockito.verify

@RunWith(AndroidJUnit4::class)
class MediaSessionCallbackTest {

    @Test
    fun `WHEN onPlay is invoked THEN forward to the active tab controller`() {
        val controller: MediaSession.Controller = mock()
        val store = storeWith(controller, MediaSession.PlaybackState.PAUSED)

        MediaSessionCallback(store, onMediaSessionPlay = { true }).onPlay()

        verify(controller).play()
    }

    @Test
    fun `WHEN onPause is invoked THEN forward to the active tab controller`() {
        val controller: MediaSession.Controller = mock()
        val store = storeWith(controller, MediaSession.PlaybackState.PLAYING)

        MediaSessionCallback(store, onMediaSessionPlay = { true }).onPause()

        verify(controller).pause()
    }

    @Test
    fun `WHEN onSkipToNext is invoked THEN forward to the active tab controller`() {
        val controller: MediaSession.Controller = mock()
        val store = storeWith(controller, MediaSession.PlaybackState.PLAYING)

        MediaSessionCallback(store, onMediaSessionPlay = { true }).onSkipToNext()

        verify(controller).nextTrack()
    }

    @Test
    fun `WHEN onSkipToPrevious is invoked THEN forward to the active tab controller`() {
        val controller: MediaSession.Controller = mock()
        val store = storeWith(controller, MediaSession.PlaybackState.PLAYING)

        MediaSessionCallback(store, onMediaSessionPlay = { true }).onSkipToPrevious()

        verify(controller).previousTrack()
    }

    @Test
    fun `WHEN onPlay is invoked THEN onMediaSessionPlay runs with the active tab before play is forwarded to it`() {
        val calls = mutableListOf<String>()
        val controller: MediaSession.Controller = mock()
        doAnswer { calls.add("play") }.`when`(controller).play()
        val store = storeWith(controller, MediaSession.PlaybackState.PAUSED)

        MediaSessionCallback(
                store,
                onMediaSessionPlay = {
                    calls.add("onMediaSessionPlay ${it.id}")
                    true
                },
            )
            .onPlay()

        assertEquals(listOf("onMediaSessionPlay test-tab", "play"), calls)
    }

    @Test
    fun `WHEN onPlay is invoked and onMediaSessionPlay returns false THEN play is not forwarded`() {
        val controller: MediaSession.Controller = mock()
        val store = storeWith(controller, MediaSession.PlaybackState.PAUSED)

        MediaSessionCallback(store, onMediaSessionPlay = { false }).onPlay()

        verify(controller, never()).play()
    }

    @Test
    fun `GIVEN no active media tab WHEN onPlay is invoked THEN onMediaSessionPlay does not run`() {
        var invoked = false

        MediaSessionCallback(
                BrowserStore(),
                onMediaSessionPlay = {
                    invoked = true
                    true
                },
            )
            .onPlay()

        assertFalse(invoked)
    }

    private fun storeWith(
        controller: MediaSession.Controller,
        playbackState: MediaSession.PlaybackState,
    ): BrowserStore {
        val tab =
            createTab(
                url = "https://www.mozilla.org",
                id = "test-tab",
                mediaSessionState = MediaSessionState(controller, playbackState = playbackState),
            )
        return BrowserStore(BrowserState(tabs = listOf(tab), selectedTabId = tab.id))
    }
}
