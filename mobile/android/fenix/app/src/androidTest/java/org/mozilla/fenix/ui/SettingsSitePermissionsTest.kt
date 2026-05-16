/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui

import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.core.net.toUri
import androidx.test.espresso.Espresso.pressBack
import androidx.test.filters.SdkSuppress
import mozilla.components.concept.engine.mediasession.MediaSession
import org.junit.Rule
import org.junit.Test
import org.mozilla.fenix.HomeActivity
import org.mozilla.fenix.customannotations.SkipLeaks
import org.mozilla.fenix.customannotations.SmokeTest
import org.mozilla.fenix.helpers.AppAndSystemHelper.grantSystemPermission
import org.mozilla.fenix.helpers.FenixTestRule
import org.mozilla.fenix.helpers.HomeActivityTestRule
import org.mozilla.fenix.helpers.MatcherHelper.itemWithText
import org.mozilla.fenix.helpers.RetryTestRule
import org.mozilla.fenix.helpers.RetryableComposeTestRule
import org.mozilla.fenix.helpers.TestAssetHelper.getGenericAsset
import org.mozilla.fenix.helpers.TestAssetHelper.mutedVideoPageAsset
import org.mozilla.fenix.helpers.TestAssetHelper.videoPageAsset
import org.mozilla.fenix.helpers.TestHelper.exitMenu
import org.mozilla.fenix.helpers.perf.DetectMemoryLeaksRule
import org.mozilla.fenix.ui.robots.browserScreen
import org.mozilla.fenix.ui.robots.clickPageObject
import org.mozilla.fenix.ui.robots.homeScreen
import org.mozilla.fenix.ui.robots.navigationToolbar

/**
 *  Tests for verifying
 *  - site permissions settings sub-menu
 *  - the settings effects on the app behavior
 *
 */
class SettingsSitePermissionsTest {
    @get:Rule(order = 0)
    val retryTestRule = RetryTestRule(3)

    // Test page created and handled by the Mozilla mobile test-eng team
    @get:Rule(order = 1)
    val fenixTestRule: FenixTestRule = FenixTestRule()

    @get:Rule(order = 2)
    val retryableComposeTestRule = RetryableComposeTestRule<HomeActivity, HomeActivityTestRule> {
        AndroidComposeTestRule(
            HomeActivityTestRule(
                isPWAsPromptEnabled = false,
                isDeleteSitePermissionsEnabled = true,
            ),
        ) { it.activity }
    }

    @get:Rule(order = 3)
    val memoryLeaksRule = DetectMemoryLeaksRule()

    private val mockWebServer get() = fenixTestRule.mockWebServer

    private val browserStore get() = fenixTestRule.browserStore

    private val permissionsTestPage = "https://mozilla-mobile.github.io/testapp/v2.0/permissions"
    private val permissionsTestPageOrigin = "https://mozilla-mobile.github.io"
    private val permissionsTestPageHost = "mozilla-mobile.github.io"

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/246974
    @Test
    fun sitePermissionsItemsTest() {
        homeScreen(retryableComposeTestRule.current) {
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openSettingsSubMenuSiteSettings {
            verifySiteSettingsToolbarTitle()
            verifyToolbarGoBackButton()
            verifyContentHeading()
            verifyAlwaysRequestDesktopSiteOption()
            verifyAlwaysRequestDesktopSiteToggleIsEnabled(enabled = false)
            verifyPermissionsHeading()
            verifySitePermissionOption("Autoplay", "Block audio only")
            verifySitePermissionOption("Camera", "Blocked by Android")
            verifySitePermissionOption("Location", "Blocked by Android")
            verifySitePermissionOption("Microphone", "Blocked by Android")
            verifySitePermissionOption("Notification", "Ask to allow")
            verifySitePermissionOption("Persistent Storage", "Ask to allow")
            verifySitePermissionOption("Cross-site cookies", "Ask to allow")
            verifySitePermissionOption("DRM-controlled content", "Ask to allow")
            verifySitePermissionOption("Exceptions")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/247680
    // Verifies that you can go to System settings and change app's permissions from inside the app
    @SmokeTest
    @Test
    @SdkSuppress(minSdkVersion = 29)
    fun systemBlockedPermissionsRedirectToSystemAppSettingsTest() {
        homeScreen(retryableComposeTestRule.current) {
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openSettingsSubMenuSiteSettings {
        }.openCamera {
            verifyBlockedByAndroidSection()
        }.goBack {
        }.openLocation {
            verifyBlockedByAndroidSection()
        }.goBack {
        }.openMicrophone {
            verifyBlockedByAndroidSection()
            clickGoToSettingsButton()
            openAppSystemPermissionsSettings()
            switchAppPermissionSystemSetting("Camera", "Allow")
            goBackToSystemAppPermissionSettings()
            verifySystemGrantedPermission("Camera")
            switchAppPermissionSystemSetting("Location", "Allow")
            goBackToSystemAppPermissionSettings()
            verifySystemGrantedPermission("Location")
            switchAppPermissionSystemSetting("Microphone", "Allow")
            goBackToSystemAppPermissionSettings()
            verifySystemGrantedPermission("Microphone")
            goBackToPermissionsSettingsSubMenu()
            verifyUnblockedByAndroid()
        }.goBack {
        }.openLocation {
            verifyUnblockedByAndroid()
        }.goBack {
        }.openCamera {
            verifyUnblockedByAndroid()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2095125
    @SmokeTest
    @Test
    fun verifyAutoplayBlockAudioOnlySettingOnNotMutedVideoTest() {
        val genericPage = mockWebServer.getGenericAsset(1)
        val videoTestPage = mockWebServer.videoPageAsset

        homeScreen(retryableComposeTestRule.current) {
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openSettingsSubMenuSiteSettings {
        }.openAutoPlay {
            verifySitePermissionsAutoPlaySubMenuItems()
            exitMenu()
        }
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(genericPage.url) {
            verifyPageContent(genericPage.content)
        }
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(videoTestPage.url) {
            try {
                verifyPageContent(videoTestPage.content)
                clickPageObject(retryableComposeTestRule.current, itemWithText("Play"))
                assertPlaybackState(browserStore, MediaSession.PlaybackState.PLAYING)
            } catch (e: AssertionError) {
                browserScreen(retryableComposeTestRule.current) {
                }.openThreeDotMenu {
                }.clickRefreshButton {
                    verifyPageContent(videoTestPage.content)
                    clickPageObject(retryableComposeTestRule.current, itemWithText("Play"))
                    assertPlaybackState(browserStore, MediaSession.PlaybackState.PLAYING)
                }
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2286807
    @SmokeTest
    @Test
    fun verifyAutoplayBlockAudioOnlySettingOnMutedVideoTest() {
        val genericPage = mockWebServer.getGenericAsset(1)
        val mutedVideoTestPage = mockWebServer.mutedVideoPageAsset

        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(genericPage.url) {
            verifyPageContent(genericPage.content)
        }
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(mutedVideoTestPage.url) {
            try {
                verifyPageContent("Media file is playing")
            } catch (e: AssertionError) {
                browserScreen(retryableComposeTestRule.current) {
                }.openThreeDotMenu {
                }.clickRefreshButton {
                    verifyPageContent("Media file is playing")
                }
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2095124
    @Test
    @SkipLeaks
    fun verifyAutoplayAllowAudioVideoSettingOnNotMutedVideoTestTest() {
        val genericPage = mockWebServer.getGenericAsset(1)
        val videoTestPage = mockWebServer.videoPageAsset

        homeScreen(retryableComposeTestRule.current) {
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openSettingsSubMenuSiteSettings {
        }.openAutoPlay {
            selectAutoplayOption("Allow audio and video")
            exitMenu()
        }
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(genericPage.url) {
            verifyPageContent(genericPage.content)
        }
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(videoTestPage.url) {
            try {
                verifyPageContent(videoTestPage.content)
                assertPlaybackState(browserStore, MediaSession.PlaybackState.PLAYING)
            } catch (e: AssertionError) {
                browserScreen(retryableComposeTestRule.current) {
                }.openThreeDotMenu {
                }.clickRefreshButton {
                    verifyPageContent(videoTestPage.content)
                    assertPlaybackState(browserStore, MediaSession.PlaybackState.PLAYING)
                }
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2286806
    @Test
    fun verifyAutoplayAllowAudioVideoSettingOnMutedVideoTest() {
        val mutedVideoTestPage = mockWebServer.mutedVideoPageAsset

        homeScreen(retryableComposeTestRule.current) {
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openSettingsSubMenuSiteSettings {
        }.openAutoPlay {
            selectAutoplayOption("Allow audio and video")
            exitMenu()
        }
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(mutedVideoTestPage.url) {
            try {
                verifyPageContent("Media file is playing")
            } catch (e: AssertionError) {
                browserScreen(retryableComposeTestRule.current) {
                }.openThreeDotMenu {
                }.clickRefreshButton {
                    verifyPageContent("Media file is playing")
                }
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2095126
    @Test
    @SkipLeaks
    fun verifyAutoplayBlockAudioAndVideoSettingOnNotMutedVideoTest() {
        val videoTestPage = mockWebServer.videoPageAsset

        homeScreen(retryableComposeTestRule.current) {
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openSettingsSubMenuSiteSettings {
        }.openAutoPlay {
            selectAutoplayOption("Block audio and video")
            exitMenu()
        }
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(videoTestPage.url) {
            try {
                verifyPageContent(videoTestPage.content)
                clickPageObject(retryableComposeTestRule.current, itemWithText("Play"))
                assertPlaybackState(browserStore, MediaSession.PlaybackState.PLAYING)
            } catch (e: AssertionError) {
                browserScreen(retryableComposeTestRule.current) {
                }.openThreeDotMenu {
                }.clickRefreshButton {
                    verifyPageContent(videoTestPage.content)
                    clickPageObject(retryableComposeTestRule.current, itemWithText("Play"))
                    assertPlaybackState(browserStore, MediaSession.PlaybackState.PLAYING)
                }
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/2286808
    @Test
    @SkipLeaks
    fun verifyAutoplayBlockAudioAndVideoSettingOnMutedVideoTest() {
        val mutedVideoTestPage = mockWebServer.mutedVideoPageAsset

        homeScreen(retryableComposeTestRule.current) {
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openSettingsSubMenuSiteSettings {
        }.openAutoPlay {
            selectAutoplayOption("Block audio and video")
            exitMenu()
        }
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(mutedVideoTestPage.url) {
            verifyPageContent("Media file not playing")
            clickPageObject(retryableComposeTestRule.current, itemWithText("Play"))
            try {
                verifyPageContent("Media file is playing")
            } catch (e: AssertionError) {
                browserScreen(retryableComposeTestRule.current) {
                }.openThreeDotMenu {
                }.clickRefreshButton {
                    clickPageObject(retryableComposeTestRule.current, itemWithText("Play"))
                    verifyPageContent("Media file is playing")
                }
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/247362
    @Test
    fun verifyCameraPermissionSettingsTest() {
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(permissionsTestPage.toUri()) {
        }.clickStartCameraButton {
            grantSystemPermission()
            verifyCameraPermissionPrompt(permissionsTestPageHost)
            pressBack()
        }
        browserScreen(retryableComposeTestRule.current) {
            browserScreen(retryableComposeTestRule.current) {
            }.openThreeDotMenu {
            }.clickSettingsButton {
            }.openSettingsSubMenuSiteSettings {
            }.openCamera {
                verifySitePermissionsCommonSubMenuItems()
                selectPermissionSettingOption("Blocked")
                exitMenu()
            }
        }.clickStartCameraButton {}
        browserScreen(retryableComposeTestRule.current) {
            verifyPageContent("Camera not allowed")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/247364
    @Test
    fun verifyMicrophonePermissionSettingsTest() {
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(permissionsTestPage.toUri()) {
        }.clickStartMicrophoneButton {
            grantSystemPermission()
            verifyMicrophonePermissionPrompt(permissionsTestPageHost)
            pressBack()
        }
        browserScreen(retryableComposeTestRule.current) {
            browserScreen(retryableComposeTestRule.current) {
            }.openThreeDotMenu {
            }.clickSettingsButton {
            }.openSettingsSubMenuSiteSettings {
            }.openMicrophone {
                verifySitePermissionsCommonSubMenuItems()
                selectPermissionSettingOption("Blocked")
                exitMenu()
            }
        }.clickStartMicrophoneButton {}
        browserScreen(retryableComposeTestRule.current) {
            verifyPageContent("Microphone not allowed")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/247363
    @Test
    fun verifyLocationPermissionSettingsTest() {
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(permissionsTestPage.toUri()) {
        }.clickGetLocationButton {
            verifyLocationPermissionPrompt(permissionsTestPageHost)
            pressBack()
        }
        browserScreen(retryableComposeTestRule.current) {
            browserScreen(retryableComposeTestRule.current) {
            }.openThreeDotMenu {
            }.clickSettingsButton {
            }.openSettingsSubMenuSiteSettings {
            }.openLocation {
                verifySitePermissionsCommonSubMenuItems()
                selectPermissionSettingOption("Blocked")
                exitMenu()
            }
        }.clickGetLocationButton {}
        browserScreen(retryableComposeTestRule.current) {
            verifyPageContent("User denied geolocation prompt")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/247365
    @Test
    fun verifyNotificationsPermissionSettingsTest() {
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(permissionsTestPage.toUri()) {
        }.clickOpenNotificationButton {
            verifyNotificationsPermissionPrompt(permissionsTestPageHost)
            pressBack()
        }
        browserScreen(retryableComposeTestRule.current) {
            browserScreen(retryableComposeTestRule.current) {
            }.openThreeDotMenu {
            }.clickSettingsButton {
            }.openSettingsSubMenuSiteSettings {
            }.openNotification {
                verifyNotificationSubMenuItems()
                selectPermissionSettingOption("Blocked")
                exitMenu()
            }
        }.clickOpenNotificationButton {}
        browserScreen(retryableComposeTestRule.current) {
            verifyPageContent("Notifications not allowed")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1923415
    @Test
    fun verifyPersistentStoragePermissionSettingsTest() {
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(permissionsTestPage.toUri()) {
        }.clickRequestPersistentStorageAccessButton {
            verifyPersistentStoragePermissionPrompt(permissionsTestPageHost)
            pressBack()
        }
        browserScreen(retryableComposeTestRule.current) {
            browserScreen(retryableComposeTestRule.current) {
            }.openThreeDotMenu {
            }.clickSettingsButton {
            }.openSettingsSubMenuSiteSettings {
            }.openPersistentStorage {
                verifySitePermissionsPersistentStorageSubMenuItems()
                selectPermissionSettingOption("Blocked")
                exitMenu()
            }
        }.clickRequestPersistentStorageAccessButton {}
        browserScreen(retryableComposeTestRule.current) {
            verifyPageContent("Persistent storage permission denied")
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/1923417
    @Test
    fun verifyDRMControlledContentPermissionSettingsTest() {
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(permissionsTestPage.toUri()) {
        }.clickRequestDRMControlledContentAccessButton {
            verifyDRMContentPermissionPrompt(permissionsTestPageHost)
            pressBack()
            browserScreen(retryableComposeTestRule.current) {
            }.openThreeDotMenu {
            }.clickSettingsButton {
            }.openSettingsSubMenuSiteSettings {
            }.openDRMControlledContent {
                verifyDRMControlledContentSubMenuItems()
                selectDRMControlledContentPermissionSettingOption("Blocked")
                exitMenu()
            }
            browserScreen(retryableComposeTestRule.current) {
            }.clickRequestDRMControlledContentAccessButton {}
            browserScreen(retryableComposeTestRule.current) {
                verifyDRMControlledContentPageContent("DRM-controlled content not allowed")
            }.openThreeDotMenu {
            }.clickSettingsButton {
            }.openSettingsSubMenuSiteSettings {
            }.openDRMControlledContent {
                selectDRMControlledContentPermissionSettingOption("Allowed")
                exitMenu()
            }
            browserScreen(retryableComposeTestRule.current) {
            }.openThreeDotMenu {
            }.clickRefreshButton {
            }.clickRequestDRMControlledContentAccessButton {}
            browserScreen(retryableComposeTestRule.current) {
                verifyDRMControlledContentPageContent("DRM-controlled content allowed")
            }
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/246976
    @SmokeTest
    @Test
    fun clearAllSitePermissionsExceptionsTest() {
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(permissionsTestPage.toUri()) {
        }.clickOpenNotificationButton {
            verifyNotificationsPermissionPrompt(permissionsTestPageHost)
        }.clickPagePermissionButton(true) {
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openSettingsSubMenuSiteSettings {
        }.openExceptions {
            verifyExceptionCreated(permissionsTestPageOrigin, true)
            clickClearPermissionsOnAllSites()
            verifyClearPermissionsDialog()
            clickCancel()
            clickClearPermissionsOnAllSites()
            clickOK()
            verifyExceptionsEmptyList()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/247007
    @Test
    fun addAndClearOneWebPagePermission() {
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(permissionsTestPage.toUri()) {
        }.clickOpenNotificationButton {
            verifyNotificationsPermissionPrompt(permissionsTestPageHost)
        }.clickPagePermissionButton(true) {
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openSettingsSubMenuSiteSettings {
        }.openExceptions {
            verifyExceptionCreated(permissionsTestPageOrigin, true)
            openSiteExceptionsDetails(permissionsTestPageOrigin)
            clickClearPermissionsForOneSite()
            verifyClearPermissionsForOneSiteDialog()
            clickCancel()
            clickClearPermissionsForOneSite()
            clickOK()
            verifyExceptionsEmptyList()
        }
    }

    // TestRail link: https://mozilla.testrail.io/index.php?/cases/view/326477
    @Test
    fun clearIndividuallyAWebPagePermission() {
        navigationToolbar(retryableComposeTestRule.current) {
        }.enterURLAndEnterToBrowser(permissionsTestPage.toUri()) {
        }.clickOpenNotificationButton {
            verifyNotificationsPermissionPrompt(permissionsTestPageHost)
        }.clickPagePermissionButton(true) {
        }.openThreeDotMenu {
        }.clickSettingsButton {
        }.openSettingsSubMenuSiteSettings {
        }.openExceptions {
            verifyExceptionCreated(permissionsTestPageOrigin, true)
            openSiteExceptionsDetails(permissionsTestPageOrigin)
            verifyPermissionSettingSummary("Notification", "Allowed")
            openChangePermissionSettingsMenu("Notification")
            clickClearOnePermissionForOneSite()
            verifyResetPermissionDefaultForThisSiteDialog()
            clickOK()
            pressBack()
            verifyPermissionSettingSummary("Notification", "Ask to allow")
            pressBack()
            // This should be changed to false, when https://bugzilla.mozilla.org/show_bug.cgi?id=1826297 is fixed
            verifyExceptionCreated(permissionsTestPageOrigin, true)
        }
    }
}
