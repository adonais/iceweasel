/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.menu

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.service.chooser.ChooserAction
import androidx.navigation.NavController
import androidx.navigation.NavDirections
import androidx.navigation.NavOptions
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import io.mockk.slot
import io.mockk.spyk
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.action.ShareResourceAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.ContentState
import mozilla.components.browser.state.state.CustomTabConfig
import mozilla.components.browser.state.state.CustomTabSessionState
import mozilla.components.browser.state.state.ReaderState
import mozilla.components.browser.state.state.content.ShareResourceState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.prompt.ShareData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.fenix.R
import org.mozilla.fenix.components.menu.share.QRCodeGenerator
import org.mozilla.fenix.components.share.CacheHelper
import org.mozilla.fenix.components.share.ShareDelegate
import org.mozilla.fenix.components.share.ShareSheetLauncherImpl
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
class ShareSheetLauncherTest {

    private val mockContext = mockk<Context>(relaxed = true)
    private val mockNavController: NavController = mockk(relaxed = true) {
        every { currentDestination?.id } returns R.id.menuDialogFragment
        every { navigate(any<NavDirections>(), any<NavOptions>()) } just runs
        every { context } returns mockContext
    }
    private val mockShareDelegate: ShareDelegate = mockk(relaxed = true) {
        every { share(any(), any()) } just runs
        every { shareWithChooserActions(any(), any(), any()) } just runs
    }

    private val contentTab = createTab(
        id = "customTab1",
        url = "content://www.mozilla.org",
    )
    private val browserStore = spyk(
        BrowserStore(BrowserState(tabs = listOf(contentTab), selectedTabId = contentTab.id)),
    )
    private val mockCacheHelper = mockk<CacheHelper> {
        every { saveBitmapToCache(any(), any(), any()) } returns Uri.parse("content://cacheDir/qr_code.png")
    }
    private val mockQRCodeGenerator = mockk<QRCodeGenerator> {
        every { generateQRCodeImage(any(), any(), any(), any()) } returns mockk<Bitmap>()
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    private val testDispatcher = UnconfinedTestDispatcher()

    private val launcher = ShareSheetLauncherImpl(
        browserStore = browserStore,
        navController = mockNavController,
        onDismiss = {},
        qrCodeGenerator = mockQRCodeGenerator,
        cacheHelper = mockCacheHelper,
        scope = CoroutineScope(testDispatcher),
        ioDispatcher = testDispatcher,
        homeActivityClass = Activity::class.java,
        shareDelegate = mockShareDelegate,
    )

    @Test
    fun `WHEN custom share sheet triggered AND non-content url provided THEN navigation updated`() = runTest {
        launcher.showCustomShareSheet(
            id = "123",
            url = "https://www.mozilla.org",
            title = "Mozilla",
            isCustomTab = false,
        )
        verify {
            mockNavController.navigate(any<NavDirections>(), any<NavOptions>())
        }
    }

    @Test
    fun `WHEN custom share sheet triggered AND content url provided THEN browser store updated`() = runTest {
        launcher.showCustomShareSheet(
            id = "123",
            url = "content://www.mozilla.org",
            title = "Mozilla",
            isCustomTab = true,
        )
        verify {
            browserStore.dispatch(any<ShareResourceAction.AddShareAction>())
        }
    }

    @Config(sdk = [33])
    @Test
    fun `WHEN native share sheet triggered on older API THEN share is invoked`() {
        val url = "https://www.mozilla.org"
        val title = "Mozilla"
        launcher.showNativeShareSheet(
            id = "123",
            longUrl = url,
            title = title,
            isCustomTab = false,
        )
        verify {
            mockShareDelegate.share(any(), any())
        }
    }

    @Test
    fun `GIVEN reader view is active WHEN navigate to share action is dispatched THEN navigate to share sheet`() = runTest {
        val title = "Mozilla"
        val readerUrl = "moz-extension://1234"
        val activeUrl = "https://mozilla.org"
        val readerTab = createTab(
            url = readerUrl,
            readerState = ReaderState(active = true, activeUrl = activeUrl),
            title = title,
        )
        val directionsSlot = slot<NavDirections>()
        val optionsSlot = slot<NavOptions>()
        launcher.showCustomShareSheet(
            id = readerTab.id,
            url = activeUrl,
            title = title,
            isCustomTab = false,
        )

        verify {
            mockNavController.navigate(
                capture(directionsSlot),
                capture(optionsSlot),
            )
        }

        val directions = directionsSlot.captured
        val directionsBundle = directions.arguments
        val shareData = directionsBundle.getParcelableArray("data", ShareData::class.java)?.firstOrNull()

        assertEquals(R.id.action_global_shareFragment, directions.actionId)
        assertNotNull(directionsBundle)
        assertEquals(readerTab.id, directionsBundle.getString("sessionId"))
        assertTrue(directionsBundle.getBoolean("showPage"))
        assertNotNull(shareData)
        assertEquals(activeUrl, shareData?.url)
        assertEquals(title, shareData?.title)

        assertEquals(R.id.browserFragment, optionsSlot.captured.popUpToId)
        assertFalse(optionsSlot.captured.isPopUpToInclusive())
    }

    @Test
    fun `GIVEN reader view is inactive WHEN navigate to share action is dispatched THEN navigate to share sheet`() = runTest {
        val url = "https://www.mozilla.org"
        val title = "Mozilla"
        val tab = createTab(
            url = url,
            title = title,
        )

        val directionsSlot = slot<NavDirections>()
        val optionsSlot = slot<NavOptions>()

        launcher.showCustomShareSheet(
            id = tab.id,
            url = url,
            title = title,
            isCustomTab = false,
        )

        verify {
            mockNavController.navigate(
                capture(directionsSlot),
                capture(optionsSlot),
            )
        }

        val directions = directionsSlot.captured
        val directionsBundle = directions.arguments
        val shareData = directionsBundle.getParcelableArray("data", ShareData::class.java)?.firstOrNull()

        assertEquals(R.id.action_global_shareFragment, directions.actionId)
        assertNotNull(directionsBundle)
        assertEquals(tab.id, directionsBundle.getString("sessionId"))
        assertTrue(directionsBundle.getBoolean("showPage"))
        assertNotNull(shareData)
        assertEquals(url, shareData?.url)
        assertEquals(title, shareData?.title)

        assertEquals(R.id.browserFragment, optionsSlot.captured.popUpToId)
        assertFalse(optionsSlot.captured.isPopUpToInclusive())
    }

    @Test
    fun `GIVEN the current tab is a local PDF WHEN share menu item is pressed THEN trigger ShareResourceAction`() = runTest {
        val id = "1"
        val url = "content://pdf.pdf"
        val title = "title"
        val tab = createTab(
            url = url,
            id = id,
        )
        launcher.showCustomShareSheet(
            id = tab.id,
            url = url,
            title = title,
            isCustomTab = true,
        )

        verify {
            browserStore.dispatch(
                ShareResourceAction.AddShareAction(
                    id,
                    ShareResourceState.LocalResource(url),
                ),
            )
        }
    }

    @Config(sdk = [33])
    @Test
    fun `GIVEN API level below 34 WHEN native share sheet triggered THEN basic share is used`() {
        launcher.showNativeShareSheet(
            id = "123",
            longUrl = "https://www.mozilla.org",
            title = "Mozilla",
        )

        verify { mockShareDelegate.share(any(), any()) }
        verify(exactly = 0) { mockShareDelegate.shareWithChooserActions(any(), any(), any()) }
    }

    @Config(sdk = [34])
    @Test
    fun `GIVEN API level 34 and valid tab id WHEN native share sheet triggered THEN chooser actions share is used`() {
        launcher.showNativeShareSheet(
            id = "123",
            longUrl = "https://www.mozilla.org",
            title = "Mozilla",
        )

        verify { mockShareDelegate.shareWithChooserActions(any(), any(), any()) }
        verify(exactly = 0) { mockShareDelegate.share(any(), any()) }
    }

    @Config(sdk = [34])
    @Test
    fun `GIVEN API level 34 and null tab id WHEN native share sheet triggered THEN basic share is used`() {
        launcher.showNativeShareSheet(
            id = null,
            longUrl = "https://www.mozilla.org",
            title = "Mozilla",
        )

        verify { mockShareDelegate.share(any(), any()) }
        verify(exactly = 0) { mockShareDelegate.shareWithChooserActions(any(), any(), any()) }
    }

    @Config(sdk = [34])
    @Test
    fun `GIVEN a private tab WHEN native share sheet triggered THEN chooser actions share is still used`() {
        launcher.showNativeShareSheet(
            id = "123",
            longUrl = "https://www.mozilla.org",
            title = "Mozilla",
            isPrivate = true,
        )

        verify { mockShareDelegate.shareWithChooserActions(any(), any(), any()) }
        verify(exactly = 0) { mockShareDelegate.share(any(), any()) }
    }

    @Config(sdk = [34])
    @Test
    fun `GIVEN API 34 and valid id WHEN native share sheet triggered THEN four chooser actions are passed`() {
        val actionsSlot = slot<Array<ChooserAction>>()
        every { mockShareDelegate.shareWithChooserActions(any(), any(), capture(actionsSlot)) } just runs

        launcher.showNativeShareSheet(
            id = "123",
            longUrl = "https://www.mozilla.org",
            title = "Mozilla",
        )

        assertEquals(4, actionsSlot.captured.size)
    }

    @Test
    fun `GIVEN the current tab is a custom tab WHEN navigate to share action is dispatched THEN navigate to share sheet`() = runTest {
        val url = "https://www.mozilla.org"
        val title = "Mozilla"
        val customTab = CustomTabSessionState(
            content = ContentState(
                url = url,
                title = title,
            ),
            config = CustomTabConfig(),
        )

        val directionsSlot = slot<NavDirections>()
        val optionsSlot = slot<NavOptions>()
        launcher.showCustomShareSheet(
            id = customTab.id,
            url = url,
            title = title,
            isCustomTab = true,
        )
        verify {
            mockNavController.navigate(
                capture(directionsSlot),
                capture(optionsSlot),
            )
        }

        val directions = directionsSlot.captured
        val directionsBundle = directions.arguments
        val shareData = directionsBundle.getParcelableArray("data", ShareData::class.java)?.firstOrNull()

        assertEquals(R.id.action_global_shareFragment, directions.actionId)
        assertNotNull(directionsBundle)
        assertEquals(customTab.id, directionsBundle.getString("sessionId"))
        assertTrue(directionsBundle.getBoolean("showPage"))
        assertNotNull(shareData)
        assertEquals(url, shareData?.url)
        assertEquals(title, shareData?.title)

        assertEquals(R.id.externalAppBrowserFragment, optionsSlot.captured.popUpToId)
        assertFalse(optionsSlot.captured.isPopUpToInclusive())
    }

    @Test
    fun `WHEN null url is provided THEN handle gracefully`() = runTest {
        val id = "123"
        val title = "Mozilla"

        // Triggering the custom share sheet with a null URL
        launcher.showCustomShareSheet(
            id = id,
            url = null,
            title = title,
            isCustomTab = false,
        )

        // Verifying that navigation does not break
        verify {
            mockNavController.navigate(any<NavDirections>(), any<NavOptions>())
        }
    }
}
