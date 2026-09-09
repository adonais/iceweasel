/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.tests

import mozilla.components.concept.engine.mediasession.MediaSession
import org.junit.Test
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.helpers.TestAssetHelper.audioPageAsset
import org.mozilla.fenix.helpers.TestAssetHelper.videoPageAsset
import org.mozilla.fenix.ui.efficiency.helpers.BaseTest
import org.mozilla.fenix.ui.efficiency.selectors.NotificationSelectors

/**
 * Tests for verifying basic functionality of media notifications:
 * - video and audio playback system notifications appear and can pause the media content Note: this test only verifies
 *   media notifications, not media itself.
 */
class MediaNotificationTest : BaseTest() {

    private val mockWebServer
        get() = fenixTestRule.mockWebServer

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1347033
    // Converted from legacy MediaNotificationTest.verifyVideoPlaybackSystemNotificationTest
    @SmokeTest
    @Test
    fun verifyVideoPlaybackSystemNotificationTest() {
        val videoTestPage = mockWebServer.videoPageAsset

        on.browserPage
            .navigateToPage(videoTestPage.url.toString())
            .clickMediaPlayButton()
            .verifyMediaPlaybackState(MediaSession.PlaybackState.PLAYING)

        on.notification
            .openNotificationTray()
            .verifyNotificationExists(NotificationSelectors.SYSTEM_NOTIFICATION(videoTestPage.title))
            .clickMediaNotificationControlButton("Pause")
            .verifyMediaNotificationButtonState("Play")
            .closeNotificationTray()

        on.browserPage.verifyMediaPlaybackState(MediaSession.PlaybackState.PAUSED)

        on.tabDrawer.navigateToPage().closeTabWithTitle(videoTestPage.title)

        on.notification
            .openNotificationTray()
            .verifyNotificationDoesNotExist(NotificationSelectors.SYSTEM_NOTIFICATION(videoTestPage.title))
            .closeNotificationTray()
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2316010
    // Converted from legacy MediaNotificationTest.verifyAudioPlaybackSystemNotificationTest
    @SmokeTest
    @Test
    fun verifyAudioPlaybackSystemNotificationTest() {
        val audioTestPage = mockWebServer.audioPageAsset

        on.browserPage
            .navigateToPage(audioTestPage.url.toString())
            .clickMediaPlayButton()
            .verifyMediaPlaybackState(MediaSession.PlaybackState.PLAYING)

        on.notification
            .openNotificationTray()
            .verifyNotificationExists(NotificationSelectors.SYSTEM_NOTIFICATION(audioTestPage.title))
            .clickMediaNotificationControlButton("Pause")
            .verifyMediaNotificationButtonState("Play")
            .closeNotificationTray()

        on.browserPage.verifyMediaPlaybackState(MediaSession.PlaybackState.PAUSED)

        on.tabDrawer.navigateToPage().closeTabWithTitle(audioTestPage.title)

        on.notification
            .openNotificationTray()
            .verifyNotificationDoesNotExist(NotificationSelectors.SYSTEM_NOTIFICATION(audioTestPage.title))
            .closeNotificationTray()
    }
}
