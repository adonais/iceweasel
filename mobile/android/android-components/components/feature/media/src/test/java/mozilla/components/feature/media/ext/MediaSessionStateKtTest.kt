/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.media.ext

import android.support.v4.media.session.PlaybackStateCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.browser.state.state.MediaSessionState
import mozilla.components.concept.engine.mediasession.MediaSession
import mozilla.components.feature.media.MediaNimbus
import mozilla.components.feature.media.MediaNotificationImprovements
import mozilla.components.support.test.mock
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MediaSessionStateKtTest {

    private val baseActions = PlaybackStateCompat.ACTION_PLAY_PAUSE or
        PlaybackStateCompat.ACTION_PLAY or
        PlaybackStateCompat.ACTION_PAUSE

    @Before
    fun setUp() {
        MediaNimbus.features.mediaNotificationImprovements.withCachedValue(
            MediaNotificationImprovements(enabled = true),
        )
    }

    @After
    fun tearDown() {
        MediaNimbus.features.mediaNotificationImprovements.withCachedValue(null)
    }

    @Test
    fun `WHEN no track features are set THEN toPlaybackState advertises only base actions`() {
        val state = MediaSessionState(
            controller = mock(),
            playbackState = MediaSession.PlaybackState.PLAYING,
        )

        assertEquals(baseActions, state.toPlaybackState().actions)
    }

    @Test
    fun `WHEN the NEXT_TRACK feature is set THEN toPlaybackState advertises SKIP_TO_NEXT`() {
        val state = MediaSessionState(
            controller = mock(),
            playbackState = MediaSession.PlaybackState.PLAYING,
            features = MediaSession.Feature(MediaSession.Feature.NEXT_TRACK),
        )

        assertEquals(
            baseActions or PlaybackStateCompat.ACTION_SKIP_TO_NEXT,
            state.toPlaybackState().actions,
        )
    }

    @Test
    fun `WHEN the PREVIOUS_TRACK feature is set THEN toPlaybackState advertises SKIP_TO_PREVIOUS`() {
        val state = MediaSessionState(
            controller = mock(),
            playbackState = MediaSession.PlaybackState.PLAYING,
            features = MediaSession.Feature(MediaSession.Feature.PREVIOUS_TRACK),
        )

        assertEquals(
            baseActions or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS,
            state.toPlaybackState().actions,
        )
    }
}
