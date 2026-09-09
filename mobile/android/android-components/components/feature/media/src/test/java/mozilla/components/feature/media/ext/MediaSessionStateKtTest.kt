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

    private val baseActions =
        PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE

    @Before
    fun setUp() {
        MediaNimbus.features.mediaNotificationImprovements.withCachedValue(
            MediaNotificationImprovements(enabled = true)
        )
    }

    @After
    fun tearDown() {
        MediaNimbus.features.mediaNotificationImprovements.withCachedValue(null)
    }

    @Test
    fun `WHEN no track features are set THEN toPlaybackState advertises only base actions`() {
        val state =
            MediaSessionState(
                controller = mock(),
                playbackState = MediaSession.PlaybackState.PLAYING,
            )

        assertEquals(baseActions, state.toPlaybackState().actions)
    }

    @Test
    fun `WHEN the NEXT_TRACK feature is set THEN toPlaybackState advertises SKIP_TO_NEXT`() {
        val state =
            MediaSessionState(
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
        val state =
            MediaSessionState(
                controller = mock(),
                playbackState = MediaSession.PlaybackState.PLAYING,
                features = MediaSession.Feature(MediaSession.Feature.PREVIOUS_TRACK),
            )

        assertEquals(
            baseActions or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS,
            state.toPlaybackState().actions,
        )
    }

    @Test
    fun `WHEN the improvements flag is disabled THEN toPlaybackState omits the timeline actions and reports an unknown position`() {
        MediaNimbus.features.mediaNotificationImprovements.withCachedValue(
            MediaNotificationImprovements(enabled = false)
        )
        val state =
            MediaSessionState(
                controller = mock(),
                playbackState = MediaSession.PlaybackState.PLAYING,
                positionState = MediaSession.PositionState(duration = 100.0, position = 30.0),
            )

        val playbackState = state.toPlaybackState()

        assertEquals(baseActions, playbackState.actions)
        assertEquals(PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, playbackState.position)
    }

    @Test
    fun `WHEN positionState has a duration THEN toPlaybackState advertises ACTION_SEEK_TO`() {
        val state =
            MediaSessionState(
                controller = mock(),
                playbackState = MediaSession.PlaybackState.PLAYING,
                positionState = MediaSession.PositionState(duration = 100.0),
            )

        assertEquals(
            baseActions or PlaybackStateCompat.ACTION_SEEK_TO,
            state.toPlaybackState().actions,
        )
    }

    @Test
    fun `WHEN the SEEK_TO feature is set THEN toPlaybackState advertises ACTION_SEEK_TO`() {
        val state =
            MediaSessionState(
                controller = mock(),
                playbackState = MediaSession.PlaybackState.PLAYING,
                features = MediaSession.Feature(MediaSession.Feature.SEEK_TO),
            )

        assertEquals(
            baseActions or PlaybackStateCompat.ACTION_SEEK_TO,
            state.toPlaybackState().actions,
        )
    }

    @Test
    fun `WHEN there is no duration and no SEEK_TO feature THEN toPlaybackState does not advertise ACTION_SEEK_TO`() {
        val state =
            MediaSessionState(
                controller = mock(),
                playbackState = MediaSession.PlaybackState.PLAYING,
            )

        assertEquals(0L, state.toPlaybackState().actions and PlaybackStateCompat.ACTION_SEEK_TO)
    }

    @Test
    fun `WHEN a position is set THEN toPlaybackState reports it in milliseconds`() {
        val state =
            MediaSessionState(
                controller = mock(),
                playbackState = MediaSession.PlaybackState.PLAYING,
                positionState = MediaSession.PositionState(duration = 100.0, position = 42.0),
            )

        assertEquals(42000L, state.toPlaybackState().position)
    }

    @Test
    fun `WHEN resetPosition is true THEN toPlaybackState reports 0 instead of positionState`() {
        val state =
            MediaSessionState(
                controller = mock(),
                playbackState = MediaSession.PlaybackState.PLAYING,
                positionState = MediaSession.PositionState(duration = 100.0, position = 42.0),
            )

        assertEquals(0L, state.toPlaybackState(resetPosition = true).position)
    }

    @Test
    fun `WHEN playing THEN toPlaybackState reports the playbackRate as the speed`() {
        val state =
            MediaSessionState(
                controller = mock(),
                playbackState = MediaSession.PlaybackState.PLAYING,
                positionState = MediaSession.PositionState(playbackRate = 1.5),
            )

        assertEquals(1.5f, state.toPlaybackState().playbackSpeed, 0.0f)
    }

    @Test
    fun `WHEN paused with a non-zero playbackRate THEN toPlaybackState reports a speed of 0`() {
        val state =
            MediaSessionState(
                controller = mock(),
                playbackState = MediaSession.PlaybackState.PAUSED,
                positionState = MediaSession.PositionState(playbackRate = 1.0),
            )

        assertEquals(0.0f, state.toPlaybackState().playbackSpeed, 0.0f)
    }
}
