/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.automotive

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.coroutines.ContinuationInterceptor
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.action.MediaSessionAction
import mozilla.components.browser.state.action.TabListAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.MediaSessionState
import mozilla.components.browser.state.state.createCustomTab
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.mediasession.MediaSession
import mozilla.components.concept.engine.mediasession.MediaSession.PlaybackState.PAUSED
import mozilla.components.concept.engine.mediasession.MediaSession.PlaybackState.PLAYING
import mozilla.components.support.test.robolectric.testContext
import org.junit.Test
import org.junit.runner.RunWith

private const val TAB_ID = "tab"

@RunWith(AndroidJUnit4::class)
class CarUxRestrictionsFeatureTest {

    @Test
    fun `GIVEN media is already playing WHEN the restriction becomes active THEN the media is paused`() = runTest {
        val controller = FakeMediaSessionController()
        val store = BrowserStore(BrowserState(tabs = listOf(mediaTab(controller, PLAYING))))
        val feature = feature(store)

        feature.setMediaRestricted(true)
        testScheduler.advanceUntilIdle()

        assertNotNull(feature.scope)
        assertEquals(1, controller.pauseInvocations)
    }

    @Test
    fun `GIVEN the restriction is active WHEN media starts playing later THEN the media is paused`() = runTest {
        val controller = FakeMediaSessionController()
        val store = BrowserStore(BrowserState(tabs = listOf(mediaTab(controller, PAUSED))))
        val feature = feature(store)

        feature.setMediaRestricted(true)
        testScheduler.advanceUntilIdle()
        assertEquals(0, controller.pauseInvocations)

        store.dispatch(MediaSessionAction.UpdateMediaPlaybackStateAction(TAB_ID, PLAYING))
        testScheduler.advanceUntilIdle()

        assertEquals(1, controller.pauseInvocations)
    }

    @Test
    fun `GIVEN the restriction is active WHEN a new tab starts playing media THEN the media is paused`() = runTest {
        val controller = FakeMediaSessionController()
        val store = BrowserStore()
        val feature = feature(store)

        feature.setMediaRestricted(true)
        store.dispatch(TabListAction.AddTabAction(mediaTab(controller, PLAYING)))
        testScheduler.advanceUntilIdle()

        assertEquals(1, controller.pauseInvocations)
    }

    @Test
    fun `GIVEN the restriction is active WHEN a custom tab plays media THEN the media is paused`() = runTest {
        val controller = FakeMediaSessionController()
        val customTab =
            createCustomTab("https://mozilla.org", id = "custom")
                .copy(mediaSessionState = MediaSessionState(controller, playbackState = PLAYING))
        val store = BrowserStore(BrowserState(customTabs = listOf(customTab)))
        val feature = feature(store)

        feature.setMediaRestricted(true)
        testScheduler.advanceUntilIdle()

        assertEquals(1, controller.pauseInvocations)
    }

    @Test
    fun `GIVEN the restriction is active WHEN unrelated state changes THEN the media is not paused again`() = runTest {
        val controller = FakeMediaSessionController()
        val store = BrowserStore(BrowserState(tabs = listOf(mediaTab(controller, PLAYING))))
        val feature = feature(store)

        feature.setMediaRestricted(true)
        testScheduler.advanceUntilIdle()

        store.dispatch(ContentAction.UpdateProgressAction(TAB_ID, 50))
        store.dispatch(ContentAction.UpdateProgressAction(TAB_ID, 100))
        testScheduler.advanceUntilIdle()

        assertEquals(1, controller.pauseInvocations)
    }

    @Test
    fun `GIVEN the restriction is not active WHEN media starts playing THEN the media keeps playing`() = runTest {
        val controller = FakeMediaSessionController()
        val store = BrowserStore(BrowserState(tabs = listOf(mediaTab(controller, PAUSED))))
        val feature = feature(store)

        feature.setMediaRestricted(false)
        store.dispatch(MediaSessionAction.UpdateMediaPlaybackStateAction(TAB_ID, PLAYING))
        testScheduler.advanceUntilIdle()

        assertNull(feature.scope)
        assertEquals(0, controller.pauseInvocations)
    }

    @Test
    fun `GIVEN the restriction was active WHEN it is lifted THEN media can play again`() = runTest {
        val controller = FakeMediaSessionController()
        val store = BrowserStore(BrowserState(tabs = listOf(mediaTab(controller, PAUSED))))
        val feature = feature(store)

        feature.setMediaRestricted(true)
        feature.setMediaRestricted(false)
        store.dispatch(MediaSessionAction.UpdateMediaPlaybackStateAction(TAB_ID, PLAYING))
        testScheduler.advanceUntilIdle()

        assertNull(feature.scope)
        assertEquals(0, controller.pauseInvocations)
    }

    @Test
    fun `GIVEN the restriction is active WHEN the feature is stopped THEN media can play again`() = runTest {
        val controller = FakeMediaSessionController()
        val store = BrowserStore(BrowserState(tabs = listOf(mediaTab(controller, PAUSED))))
        val feature = feature(store)

        feature.setMediaRestricted(true)
        feature.stop()
        store.dispatch(MediaSessionAction.UpdateMediaPlaybackStateAction(TAB_ID, PLAYING))
        testScheduler.advanceUntilIdle()

        assertNull(feature.scope)
        assertEquals(0, controller.pauseInvocations)
    }

    @Test
    fun `GIVEN this is not an automotive device WHEN the feature is started THEN no media is paused`() = runTest {
        val controller = FakeMediaSessionController()
        val store = BrowserStore(BrowserState(tabs = listOf(mediaTab(controller, PLAYING))))
        val feature = feature(store)

        feature.start()
        testScheduler.advanceUntilIdle()

        assertNull(feature.scope)
        assertEquals(0, controller.pauseInvocations)
    }

    private fun TestScope.feature(store: BrowserStore) =
        CarUxRestrictionsFeature(
            applicationContext = testContext,
            store = store,
            mainDispatcher = coroutineContext[ContinuationInterceptor] as CoroutineDispatcher,
        )

    private fun mediaTab(controller: MediaSession.Controller, playbackState: MediaSession.PlaybackState) =
        createTab("https://mozilla.org", id = TAB_ID)
            .copy(mediaSessionState = MediaSessionState(controller, playbackState = playbackState))
}

private class FakeMediaSessionController : MediaSession.Controller {
    var pauseInvocations = 0
        private set

    override fun pause() {
        pauseInvocations++
    }

    override fun stop() = Unit

    override fun play() = Unit

    override fun seekTo(time: Double, fast: Boolean) = Unit

    override fun seekForward() = Unit

    override fun seekBackward() = Unit

    override fun nextTrack() = Unit

    override fun previousTrack() = Unit

    override fun skipAd() = Unit

    override fun muteAudio(mute: Boolean) = Unit
}
