/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.state.engine

import android.content.Intent
import android.view.WindowManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.action.BrowserAction
import mozilla.components.browser.state.action.ContentAction
import mozilla.components.browser.state.action.CookieBannerAction
import mozilla.components.browser.state.action.CrashAction
import mozilla.components.browser.state.action.ReaderAction
import mozilla.components.browser.state.action.TabListAction
import mozilla.components.browser.state.action.TrackingProtectionAction
import mozilla.components.browser.state.action.TranslationsAction
import mozilla.components.browser.state.selector.findTab
import mozilla.components.browser.state.selector.selectedTab
import mozilla.components.browser.state.state.AppIntentState
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.LoadRequestState
import mozilla.components.browser.state.state.MediaSessionState
import mozilla.components.browser.state.state.SecurityInfo
import mozilla.components.browser.state.state.content.FindResultState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.EngineSession
import mozilla.components.concept.engine.EngineSession.CookieBannerHandlingStatus.HANDLED
import mozilla.components.concept.engine.EngineSessionState
import mozilla.components.concept.engine.HitResult
import mozilla.components.concept.engine.Settings
import mozilla.components.concept.engine.content.blocking.Tracker
import mozilla.components.concept.engine.history.HistoryItem
import mozilla.components.concept.engine.manifest.WebAppManifest
import mozilla.components.concept.engine.mediasession.MediaSession
import mozilla.components.concept.engine.permission.PermissionRequest
import mozilla.components.concept.engine.prompt.PromptRequest
import mozilla.components.concept.engine.translate.TranslationError
import mozilla.components.concept.engine.translate.TranslationOperation
import mozilla.components.concept.engine.translate.TranslationOptions
import mozilla.components.concept.engine.window.WindowRequest
import mozilla.components.concept.fetch.Header
import mozilla.components.concept.fetch.Headers.Names.E_TAG
import mozilla.components.concept.fetch.MutableHeaders
import mozilla.components.concept.fetch.Response
import mozilla.components.support.test.middleware.CaptureActionsMiddleware
import mozilla.components.support.test.mock
import mozilla.components.support.test.whenever
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class EngineObserverTest {
    // TO DO: add tests for product URL after a test endpoint is implemented in desktop (Bug 1846341)
    @Test
    fun engineSessionObserver() = runTest {
        val engineSession = object : EngineSession() {
            override val settings: Settings = mock()
            override fun goBack(userInteraction: Boolean) {}
            override fun goForward(userInteraction: Boolean) {}
            override fun goToHistoryIndex(index: Int) {}
            override fun reload(flags: LoadUrlFlags) {}
            override fun stopLoading() {}
            override fun restoreState(state: EngineSessionState): Boolean { return false }
            override fun flushSessionState() {}
            override fun updateTrackingProtection(policy: TrackingProtectionPolicy) {}
            override fun toggleDesktopMode(enable: Boolean, reload: Boolean) {
                notifyObservers { onDesktopModeChange(enable) }
            }
            override fun hasCookieBannerRuleForSession(
                onResult: (Boolean) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun checkForPdfViewer(
                onResult: (Boolean) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun getWebCompatInfo(
                onResult: (JSONObject) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun sendMoreWebCompatInfo(
                info: JSONObject,
                onResult: () -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun requestTranslate(
                fromLanguage: String,
                toLanguage: String,
                options: TranslationOptions?,
            ) {}
            override fun requestTranslationRestore() {}
            override fun getNeverTranslateSiteSetting(
                onResult: (Boolean) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun setNeverTranslateSiteSetting(
                setting: Boolean,
                onResult: () -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun findAll(text: String) {}
            override fun findNext(forward: Boolean) {}
            override fun clearFindMatches() {}
            override fun exitFullScreenMode() {}
            override fun purgeHistory() {}
            override fun loadData(data: String, mimeType: String, encoding: String) {
                notifyObservers { onLocationChange(data, false) }
                notifyObservers { onProgress(100) }
                notifyObservers { onLoadingStateChange(true) }
                notifyObservers { onNavigationStateChange(true, true) }
            }
            override fun requestPdfToDownload() = Unit
            override fun requestPrintContent() = Unit
            override fun loadUrl(
                url: String,
                parent: EngineSession?,
                flags: LoadUrlFlags,
                additionalHeaders: Map<String, String>?,
                originalInput: String?,
                textDirectiveUserActivation: Boolean,
            ) {
                notifyObservers { onLocationChange(url, false) }
                notifyObservers { onProgress(100) }
                notifyObservers { onLoadingStateChange(true) }
                notifyObservers { onNavigationStateChange(true, true) }
            }
        }

        val store = BrowserStore()
        store.dispatch(TabListAction.AddTabAction(createTab("https://www.mozilla.org", id = "mozilla")))

        engineSession.register(createEngineObserver(store = store, scope = this))
        engineSession.loadUrl("http://mozilla.org")
        engineSession.toggleDesktopMode(true)
        advanceUntilIdle()

        assertEquals("http://mozilla.org", store.state.selectedTab?.content?.url)
        assertEquals(100, store.state.selectedTab?.content?.progress)
        assertEquals(true, store.state.selectedTab?.content?.loading)

        val tab = store.state.findTab("mozilla")
        assertNotNull(tab!!)
        assertTrue(tab.content.canGoForward)
        assertTrue(tab.content.canGoBack)
    }

    @Test
    fun engineSessionObserverWithSecurityChanges() = runTest {
        val engineSession = object : EngineSession() {
            override val settings: Settings = mock()
            override fun goBack(userInteraction: Boolean) {}
            override fun goForward(userInteraction: Boolean) {}
            override fun goToHistoryIndex(index: Int) {}
            override fun stopLoading() {}
            override fun reload(flags: LoadUrlFlags) {}
            override fun restoreState(state: EngineSessionState): Boolean { return false }
            override fun flushSessionState() {}
            override fun updateTrackingProtection(policy: TrackingProtectionPolicy) {}
            override fun toggleDesktopMode(enable: Boolean, reload: Boolean) {}
            override fun hasCookieBannerRuleForSession(
                onResult: (Boolean) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun checkForPdfViewer(
                onResult: (Boolean) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun getWebCompatInfo(
                onResult: (JSONObject) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun sendMoreWebCompatInfo(
                info: JSONObject,
                onResult: () -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun requestTranslate(
                fromLanguage: String,
                toLanguage: String,
                options: TranslationOptions?,
            ) {}
            override fun requestTranslationRestore() {}
            override fun getNeverTranslateSiteSetting(
                onResult: (Boolean) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun setNeverTranslateSiteSetting(
                setting: Boolean,
                onResult: () -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun findAll(text: String) {}
            override fun findNext(forward: Boolean) {}
            override fun clearFindMatches() {}
            override fun exitFullScreenMode() {}
            override fun purgeHistory() {}
            override fun loadData(data: String, mimeType: String, encoding: String) {}
            override fun requestPdfToDownload() = Unit
            override fun requestPrintContent() = Unit
            override fun loadUrl(
                url: String,
                parent: EngineSession?,
                flags: LoadUrlFlags,
                additionalHeaders: Map<String, String>?,
                originalInput: String?,
                textDirectiveUserActivation: Boolean,
            ) {
                if (url.startsWith("https://")) {
                    notifyObservers { onSecurityChange(true, "host", "issuer", null) }
                } else {
                    notifyObservers { onSecurityChange(false) }
                }
            }
        }

        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab("https://www.mozilla.org", id = "mozilla"),
                ),
            ),
        )

        engineSession.register(createEngineObserver(store = store, scope = this))

        engineSession.loadUrl("http://mozilla.org")
        advanceUntilIdle()

        assertEquals(SecurityInfo.Insecure(), store.state.tabs[0].content.securityInfo)

        engineSession.loadUrl("https://mozilla.org")
        advanceUntilIdle()

        assertEquals(SecurityInfo.Secure("host", "issuer"), store.state.tabs[0].content.securityInfo)
    }

    @Test
    fun engineSessionObserverWithTrackingProtection() = runTest {
        val engineSession = object : EngineSession() {
            override val settings: Settings = mock()
            override fun goBack(userInteraction: Boolean) {}
            override fun goForward(userInteraction: Boolean) {}
            override fun goToHistoryIndex(index: Int) {}
            override fun stopLoading() {}
            override fun reload(flags: LoadUrlFlags) {}
            override fun restoreState(state: EngineSessionState): Boolean { return false }
            override fun flushSessionState() {}
            override fun updateTrackingProtection(policy: TrackingProtectionPolicy) {}
            override fun toggleDesktopMode(enable: Boolean, reload: Boolean) {}
            override fun hasCookieBannerRuleForSession(
                onResult: (Boolean) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun checkForPdfViewer(
                onResult: (Boolean) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun getWebCompatInfo(
                onResult: (JSONObject) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun sendMoreWebCompatInfo(
                info: JSONObject,
                onResult: () -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun requestTranslate(
                fromLanguage: String,
                toLanguage: String,
                options: TranslationOptions?,
            ) {}
            override fun requestTranslationRestore() {}
            override fun getNeverTranslateSiteSetting(
                onResult: (Boolean) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun setNeverTranslateSiteSetting(
                setting: Boolean,
                onResult: () -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun loadUrl(
                url: String,
                parent: EngineSession?,
                flags: LoadUrlFlags,
                additionalHeaders: Map<String, String>?,
                originalInput: String?,
                textDirectiveUserActivation: Boolean,
            ) {}
            override fun loadData(data: String, mimeType: String, encoding: String) {}
            override fun requestPdfToDownload() = Unit
            override fun requestPrintContent() = Unit
            override fun findAll(text: String) {}
            override fun findNext(forward: Boolean) {}
            override fun clearFindMatches() {}
            override fun exitFullScreenMode() {}
            override fun purgeHistory() {}
        }
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab("https://www.mozilla.org", id = "mozilla"),
                ),
            ),
        )
        val observer = createEngineObserver(store = store, scope = this)
        engineSession.register(observer)

        val tracker1 = Tracker("tracker1", emptyList())
        val tracker2 = Tracker("tracker2", emptyList())

        observer.onTrackerBlocked(tracker1)
        advanceUntilIdle()

        assertEquals(listOf(tracker1), store.state.tabs[0].trackingProtection.blockedTrackers)

        observer.onTrackerBlocked(tracker2)
        advanceUntilIdle()

        assertEquals(listOf(tracker1, tracker2), store.state.tabs[0].trackingProtection.blockedTrackers)
    }

    @Test
    fun `WHEN the first page load is complete, set the translations initialized`() = runTest {
        val engineSession = object : EngineSession() {
            override val settings: Settings = mock()
            override fun goBack(userInteraction: Boolean) {}
            override fun goForward(userInteraction: Boolean) {}
            override fun goToHistoryIndex(index: Int) {}
            override fun stopLoading() {}
            override fun reload(flags: LoadUrlFlags) {}
            override fun restoreState(state: EngineSessionState): Boolean { return false }
            override fun flushSessionState() {}
            override fun updateTrackingProtection(policy: TrackingProtectionPolicy) {}
            override fun toggleDesktopMode(enable: Boolean, reload: Boolean) {}
            override fun hasCookieBannerRuleForSession(
                onResult: (Boolean) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun checkForPdfViewer(
                onResult: (Boolean) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun getWebCompatInfo(
                onResult: (JSONObject) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun sendMoreWebCompatInfo(
                info: JSONObject,
                onResult: () -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun requestTranslate(
                fromLanguage: String,
                toLanguage: String,
                options: TranslationOptions?,
            ) {}
            override fun requestTranslationRestore() {}
            override fun getNeverTranslateSiteSetting(
                onResult: (Boolean) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun setNeverTranslateSiteSetting(
                setting: Boolean,
                onResult: () -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun findAll(text: String) {}
            override fun findNext(forward: Boolean) {}
            override fun clearFindMatches() {}
            override fun exitFullScreenMode() {}
            override fun purgeHistory() {}
            override fun loadData(data: String, mimeType: String, encoding: String) {}
            override fun requestPdfToDownload() = Unit
            override fun requestPrintContent() = Unit
            override fun loadUrl(
                url: String,
                parent: EngineSession?,
                flags: LoadUrlFlags,
                additionalHeaders: Map<String, String>?,
                originalInput: String?,
                textDirectiveUserActivation: Boolean,
            ) {
                notifyObservers { onProgress(100) }
            }
        }

        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab("https://www.mozilla.org", id = "mozilla"),
                ),
            ),
        )

        assertEquals(false, store.state.translationsInitialized)

        engineSession.register(createEngineObserver(store = store, scope = this))

        engineSession.loadUrl("https://mozilla.org")

        advanceUntilIdle()

        assertEquals(true, store.state.translationsInitialized)
    }

    @Test
    fun `WHEN the first page load is not complete, do not set the translations initialized`() = runTest {
        val engineSession = object : EngineSession() {
            override val settings: Settings = mock()
            override fun goBack(userInteraction: Boolean) {}
            override fun goForward(userInteraction: Boolean) {}
            override fun goToHistoryIndex(index: Int) {}
            override fun stopLoading() {}
            override fun reload(flags: LoadUrlFlags) {}
            override fun restoreState(state: EngineSessionState): Boolean { return false }
            override fun flushSessionState() {}
            override fun updateTrackingProtection(policy: TrackingProtectionPolicy) {}
            override fun toggleDesktopMode(enable: Boolean, reload: Boolean) {}
            override fun hasCookieBannerRuleForSession(
                onResult: (Boolean) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun checkForPdfViewer(
                onResult: (Boolean) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun getWebCompatInfo(
                onResult: (JSONObject) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun sendMoreWebCompatInfo(
                info: JSONObject,
                onResult: () -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun requestTranslate(
                fromLanguage: String,
                toLanguage: String,
                options: TranslationOptions?,
            ) {}
            override fun requestTranslationRestore() {}
            override fun getNeverTranslateSiteSetting(
                onResult: (Boolean) -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun setNeverTranslateSiteSetting(
                setting: Boolean,
                onResult: () -> Unit,
                onException: (Throwable) -> Unit,
            ) {}
            override fun findAll(text: String) {}
            override fun findNext(forward: Boolean) {}
            override fun clearFindMatches() {}
            override fun exitFullScreenMode() {}
            override fun purgeHistory() {}
            override fun loadData(data: String, mimeType: String, encoding: String) {}
            override fun requestPdfToDownload() = Unit
            override fun requestPrintContent() = Unit
            override fun loadUrl(
                url: String,
                parent: EngineSession?,
                flags: LoadUrlFlags,
                additionalHeaders: Map<String, String>?,
                originalInput: String?,
                textDirectiveUserActivation: Boolean,
            ) {
                notifyObservers { onProgress(80) }
            }
        }

        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab("https://www.mozilla.org", id = "mozilla"),
                ),
            ),
        )

        assertEquals(false, store.state.translationsInitialized)

        engineSession.register(createEngineObserver(store = store, scope = this))

        engineSession.loadUrl("https://mozilla.org")

        assertEquals(false, store.state.translationsInitialized)
    }

    @Test
    fun `Do not initialize the translations flow if the page load is not complete`() = runTest {
        val store: BrowserStore = mock()
        val state: BrowserState = mock()
        `when`(store.state).thenReturn(state)
        `when`(store.state.translationsInitialized).thenReturn(false)

        val observer = createEngineObserver(store = store, scope = this)

        observer.onProgress(80)

        verify(store, never()).dispatch(
            TranslationsAction.InitTranslationsBrowserState,
        )
    }

    @Test
    fun `Initialize the translations flow if page load is complete and it is not yet initialized`() = runTest {
        val store: BrowserStore = mock()
        val state: BrowserState = mock()
        `when`(store.state).thenReturn(state)
        `when`(store.state.translationsInitialized).thenReturn(false)

        val observer = createEngineObserver(store = store, scope = this)

        observer.onProgress(100)
        advanceUntilIdle()

        verify(store).dispatch(
            TranslationsAction.InitTranslationsBrowserState,
        )
    }

    @Test
    fun `Do not initialize the translations flow if it is already initialized`() = runTest {
        val store: BrowserStore = mock()
        val state: BrowserState = mock()
        `when`(store.state).thenReturn(state)
        `when`(store.state.translationsInitialized).thenReturn(true)

        val observer = createEngineObserver(store = store, scope = this)

        observer.onProgress(100)

        verify(store, never()).dispatch(
            TranslationsAction.InitTranslationsBrowserState,
        )
    }

    @Test
    fun engineSessionObserverExcludedOnTrackingProtection() = runTest {
        val store: BrowserStore = mock()
        val observer = createEngineObserver(store = store, scope = this)

        observer.onExcludedOnTrackingProtectionChange(true)
        advanceUntilIdle()

        verify(store).dispatch(
            TrackingProtectionAction.ToggleExclusionListAction(
                "mozilla",
                true,
            ),
        )
    }

    @Test
    fun `WHEN onCookieBannerChange is called THEN dispatch an CookieBannerAction UpdateStatusAction`() = runTest {
        val store: BrowserStore = mock()
        val observer = createEngineObserver(store = store, scope = this)

        observer.onCookieBannerChange(HANDLED)
        advanceUntilIdle()

        verify(store).dispatch(
            CookieBannerAction.UpdateStatusAction(
                "mozilla",
                HANDLED,
            ),
        )
    }

    @Test
    fun `WHEN onTranslatePageChange is called THEN dispatch a TranslationsAction SetTranslateProcessingAction`() = runTest {
        val store: BrowserStore = mock()
        val observer = createEngineObserver(store = store, scope = this)

        observer.onTranslatePageChange()
        advanceUntilIdle()

        verify(store).dispatch(
            TranslationsAction.SetTranslateProcessingAction(
                "mozilla",
                false,
            ),
        )
    }

    @Test
    fun `WHEN onTranslateComplete is called THEN dispatch a TranslationsAction TranslateSuccessAction`() = runTest {
        val store: BrowserStore = mock()
        val observer = createEngineObserver(store = store, scope = this)

        observer.onTranslateComplete(operation = TranslationOperation.TRANSLATE)
        advanceUntilIdle()

        verify(store).dispatch(
            TranslationsAction.TranslateSuccessAction("mozilla", operation = TranslationOperation.TRANSLATE),
        )
    }

    @Test
    fun `WHEN onTranslateException is called THEN dispatch a TranslationsAction TranslateExceptionAction`() = runTest {
        val store: BrowserStore = mock()
        val observer = createEngineObserver(store = store, scope = this)
        val exception = TranslationError.UnknownError(Exception())

        observer.onTranslateException(operation = TranslationOperation.TRANSLATE, exception)
        advanceUntilIdle()

        verify(store).dispatch(
            TranslationsAction.TranslateExceptionAction("mozilla", operation = TranslationOperation.TRANSLATE, exception),
        )
    }

    @Test
    fun engineObserverClearsWebsiteTitleIfNewPageStartsLoading() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                        title = "Hello World",
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)
        observer.onTitleChange("Mozilla")
        advanceUntilIdle()

        assertEquals("Mozilla", store.state.tabs[0].content.title)

        observer.onLocationChange("https://getpocket.com", false)
        advanceUntilIdle()

        assertEquals("", store.state.tabs[0].content.title)
    }

    @Test
    fun `EngineObserver does not clear title if the URL did not change`() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                        title = "Hello World",
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)

        observer.onTitleChange("Mozilla")
        advanceUntilIdle()

        assertEquals("Mozilla", store.state.tabs[0].content.title)

        observer.onLocationChange("https://www.mozilla.org", false)
        advanceUntilIdle()

        assertEquals("Mozilla", store.state.tabs[0].content.title)
    }

    @Test
    fun `EngineObserver does not clear title if the URL changes hash`() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                        title = "Hello World",
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)

        observer.onTitleChange("Mozilla")
        advanceUntilIdle()

        assertEquals("Mozilla", store.state.tabs[0].content.title)

        observer.onLocationChange("https://www.mozilla.org/#something", false)
        advanceUntilIdle()

        assertEquals("Mozilla", store.state.tabs[0].content.title)
    }

    @Test
    fun `EngineObserver clears previewImageUrl if new page starts loading`() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                        title = "Hello World",
                    ),
                ),
            ),
        )
        val previewImageUrl = "https://test.com/og-image-url"

        val observer = createEngineObserver(store = store, scope = this)
        observer.onPreviewImageChange(previewImageUrl)
        advanceUntilIdle()

        assertEquals(previewImageUrl, store.state.tabs[0].content.previewImageUrl)

        observer.onLocationChange("https://getpocket.com", false)
        advanceUntilIdle()

        assertNull(store.state.tabs[0].content.previewImageUrl)
    }

    @Test
    fun `EngineObserver does not clear previewImageUrl if the URL did not change`() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                        title = "Hello World",
                    ),
                ),
            ),
        )
        val previewImageUrl = "https://test.com/og-image-url"

        val observer = createEngineObserver(store = store, scope = this)

        observer.onPreviewImageChange(previewImageUrl)
        advanceUntilIdle()

        assertEquals(previewImageUrl, store.state.tabs[0].content.previewImageUrl)

        observer.onLocationChange("https://www.mozilla.org", false)
        advanceUntilIdle()

        assertEquals(previewImageUrl, store.state.tabs[0].content.previewImageUrl)

        observer.onLocationChange("https://www.mozilla.org/#something", false)
        advanceUntilIdle()

        assertEquals(previewImageUrl, store.state.tabs[0].content.previewImageUrl)
    }

    @Test
    fun engineObserverClearsBlockedTrackersIfNewPageStartsLoading() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)

        val tracker1 = Tracker("tracker1")
        val tracker2 = Tracker("tracker2")

        observer.onTrackerBlocked(tracker1)
        observer.onTrackerBlocked(tracker2)
        advanceUntilIdle()

        assertEquals(listOf(tracker1, tracker2), store.state.tabs[0].trackingProtection.blockedTrackers)

        observer.onLoadingStateChange(true)
        advanceUntilIdle()

        assertEquals(emptyList<String>(), store.state.tabs[0].trackingProtection.blockedTrackers)
    }

    @Test
    fun engineObserverClearsLoadedTrackersIfNewPageStartsLoading() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)

        val tracker1 = Tracker("tracker1")
        val tracker2 = Tracker("tracker2")

        observer.onTrackerLoaded(tracker1)
        observer.onTrackerLoaded(tracker2)
        advanceUntilIdle()

        assertEquals(listOf(tracker1, tracker2), store.state.tabs[0].trackingProtection.loadedTrackers)

        observer.onLoadingStateChange(true)
        advanceUntilIdle()

        assertEquals(emptyList<String>(), store.state.tabs[0].trackingProtection.loadedTrackers)
    }

    @Test
    fun engineObserverClearsWebAppManifestIfNewPageStartsLoading() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                    ),
                ),
            ),
        )

        val manifest = WebAppManifest(name = "Mozilla", startUrl = "https://mozilla.org")

        val observer = createEngineObserver(store = store, scope = this)

        observer.onWebAppManifestLoaded(manifest)
        advanceUntilIdle()

        assertEquals(manifest, store.state.tabs[0].content.webAppManifest)

        observer.onLocationChange("https://getpocket.com", false)
        advanceUntilIdle()

        assertNull(store.state.tabs[0].content.webAppManifest)
    }

    @Test
    fun engineObserverClearsContentPermissionRequestIfNewPageStartsLoading() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)

        val request: PermissionRequest = mock()

        store.dispatch(ContentAction.UpdatePermissionsRequest("mozilla", request))
        advanceUntilIdle()

        assertEquals(listOf(request), store.state.tabs[0].content.permissionRequestsList)

        observer.onLocationChange("https://getpocket.com", false)
        advanceUntilIdle()

        assertEquals(emptyList<PermissionRequest>(), store.state.tabs[0].content.permissionRequestsList)
    }

    @Test
    fun engineObserverDoesNotClearContentPermissionRequestIfSamePageStartsLoading() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)

        val request: PermissionRequest = mock()

        store.dispatch(ContentAction.UpdatePermissionsRequest("mozilla", request))

        assertEquals(listOf(request), store.state.tabs[0].content.permissionRequestsList)

        observer.onLocationChange("https://www.mozilla.org/hello.html", false)

        assertEquals(listOf(request), store.state.tabs[0].content.permissionRequestsList)
    }

    @Test
    fun engineObserverDoesNotClearWebAppManifestIfNewPageInStartUrlScope() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                    ),
                ),
            ),
        )

        val manifest = WebAppManifest(name = "Mozilla", startUrl = "https://www.mozilla.org")

        val observer = createEngineObserver(store = store, scope = this)

        observer.onWebAppManifestLoaded(manifest)
        advanceUntilIdle()

        assertEquals(manifest, store.state.tabs[0].content.webAppManifest)

        observer.onLocationChange("https://www.mozilla.org/hello.html", false)

        assertEquals(manifest, store.state.tabs[0].content.webAppManifest)
    }

    @Test
    fun engineObserverDoesNotClearWebAppManifestIfNewPageInScope() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                    ),
                ),
            ),
        )

        val manifest = WebAppManifest(
            name = "Mozilla",
            startUrl = "https://www.mozilla.org",
            scope = "https://www.mozilla.org/hello/",
        )

        val observer = createEngineObserver(store = store, scope = this)

        observer.onWebAppManifestLoaded(manifest)
        advanceUntilIdle()

        assertEquals(manifest, store.state.tabs[0].content.webAppManifest)

        observer.onLocationChange("https://www.mozilla.org/hello/page2.html", false)
        advanceUntilIdle()

        assertEquals(manifest, store.state.tabs[0].content.webAppManifest)

        observer.onLocationChange("https://www.mozilla.org/hello.html", false)
        advanceUntilIdle()

        assertNull(store.state.tabs[0].content.webAppManifest)
    }

    @Test
    fun engineObserverPassingHitResult() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)

        val hitResult = HitResult.UNKNOWN("data://foobar")

        observer.onLongPress(hitResult)
        advanceUntilIdle()

        assertEquals(hitResult, store.state.tabs[0].content.hitResult)
    }

    @Test
    fun engineObserverClearsFindResults() = runTest {
        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            middleware = listOf(middleware),
        )
        val observer = createEngineObserver(tabId = "tab", store = store, scope = this)

        observer.onFindResult(0, 1, false)
        advanceUntilIdle()
        middleware.assertFirstAction(ContentAction.AddFindResultAction::class) { action ->
            assertEquals("tab", action.sessionId)
            assertEquals(FindResultState(0, 1, false), action.findResult)
        }

        observer.onFind("mozilla")
        advanceUntilIdle()
        middleware.assertLastAction(ContentAction.ClearFindResultsAction::class) { action ->
            assertEquals("tab", action.sessionId)
        }
    }

    @Test
    fun engineObserverClearsFindResultIfNewPageStartsLoading() = runTest {
        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            middleware = listOf(middleware),
        )
        val observer = createEngineObserver(tabId = "tab-id", store = store, scope = this)

        observer.onFindResult(0, 1, false)
        advanceUntilIdle()
        middleware.assertFirstAction(ContentAction.AddFindResultAction::class) { action ->
            assertEquals("tab-id", action.sessionId)
            assertEquals(FindResultState(0, 1, false), action.findResult)
        }

        observer.onFindResult(1, 2, true)
        advanceUntilIdle()
        middleware.assertLastAction(ContentAction.AddFindResultAction::class) { action ->
            assertEquals("tab-id", action.sessionId)
            assertEquals(FindResultState(1, 2, true), action.findResult)
        }

        observer.onLoadingStateChange(true)
        advanceUntilIdle()
        middleware.assertLastAction(ContentAction.ClearFindResultsAction::class) { action ->
            assertEquals("tab-id", action.sessionId)
        }
    }

    @Test
    fun engineObserverClearsRefreshCanceledIfNewPageStartsLoading() = runTest {
        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            middleware = listOf(middleware),
        )
        val observer = EngineObserver(
            tabId = "tab-id",
            store = store,
            scope = this,
        )

        observer.onRepostPromptCancelled()
        advanceUntilIdle()
        middleware.assertFirstAction(ContentAction.UpdateRefreshCanceledStateAction::class) { action ->
            assertEquals("tab-id", action.sessionId)
            assertTrue(action.refreshCanceled)
        }

        observer.onLoadingStateChange(true)
        advanceUntilIdle()
        middleware.assertLastAction(ContentAction.UpdateRefreshCanceledStateAction::class) { action ->
            assertEquals("tab-id", action.sessionId)
            assertFalse(action.refreshCanceled)
        }
    }

    @Test
    fun engineObserverHandlesOnRepostPromptCancelled() = runTest {
        val store: BrowserStore = mock()
        val observer = EngineObserver(
            tabId = "tab-id",
            store = store,
            scope = this,
        )

        observer.onRepostPromptCancelled()
        advanceUntilIdle()

        verify(store).dispatch(ContentAction.UpdateRefreshCanceledStateAction("tab-id", true))
    }

    @Test
    fun engineObserverHandlesOnBeforeUnloadDenied() = runTest {
        val store: BrowserStore = mock()
        val observer = EngineObserver(
            tabId = "tab-id",
            store = store,
            scope = this,
        )

        observer.onBeforeUnloadPromptDenied()
        advanceUntilIdle()
        verify(store).dispatch(ContentAction.UpdateRefreshCanceledStateAction("tab-id", true))
    }

    @Test
    fun engineObserverNotifiesFullscreenMode() = runTest {
        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            middleware = listOf(middleware),
        )
        val observer = EngineObserver(
            tabId = "tab-id",
            store = store,
            scope = this,
        )

        observer.onFullScreenChange(true)
        advanceUntilIdle()
        middleware.assertFirstAction(ContentAction.FullScreenChangedAction::class) { action ->
            assertEquals("tab-id", action.sessionId)
            assertTrue(action.fullScreenEnabled)
        }

        observer.onFullScreenChange(false)
        advanceUntilIdle()
        middleware.assertLastAction(ContentAction.FullScreenChangedAction::class) { action ->
            assertEquals("tab-id", action.sessionId)
            assertFalse(action.fullScreenEnabled)
        }
    }

    @Test
    fun engineObserverNotifiesDesktopMode() = runTest {
        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            middleware = listOf(middleware),
        )
        val observer = EngineObserver(
            tabId = "tab-id",
            store = store,
            scope = this,
        )

        observer.onDesktopModeChange(true)
        advanceUntilIdle()
        middleware.assertFirstAction(ContentAction.UpdateTabDesktopMode::class) { action ->
            assertEquals("tab-id", action.sessionId)
            assertTrue(action.enabled)
        }

        observer.onDesktopModeChange(false)
        advanceUntilIdle()
        middleware.assertLastAction(ContentAction.UpdateTabDesktopMode::class) { action ->
            assertEquals("tab-id", action.sessionId)
            assertFalse(action.enabled)
        }
    }

    @Test
    fun engineObserverNotifiesMetaViewportFitChange() = runTest {
        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            middleware = listOf(middleware),
        )
        val observer = EngineObserver(
            tabId = "tab-id",
            store = store,
            scope = this,
        )

        observer.onMetaViewportFitChanged(WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT)
        advanceUntilIdle()

        middleware.assertFirstAction(ContentAction.ViewportFitChangedAction::class) { action ->
            assertEquals("tab-id", action.sessionId)
            assertEquals(
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT,
                action.layoutInDisplayCutoutMode,
            )
        }

        observer.onMetaViewportFitChanged(WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES)
        advanceUntilIdle()

        middleware.assertLastAction(ContentAction.ViewportFitChangedAction::class) { action ->
            assertEquals("tab-id", action.sessionId)
            assertEquals(
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES,
                action.layoutInDisplayCutoutMode,
            )
        }

        observer.onMetaViewportFitChanged(WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER)
        advanceUntilIdle()

        middleware.assertLastAction(ContentAction.ViewportFitChangedAction::class) { action ->
            assertEquals("tab-id", action.sessionId)
            assertEquals(
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER,
                action.layoutInDisplayCutoutMode,
            )
        }

        observer.onMetaViewportFitChanged(123)
        advanceUntilIdle()

        middleware.assertLastAction(ContentAction.ViewportFitChangedAction::class) { action ->
            assertEquals("tab-id", action.sessionId)
            assertEquals(123, action.layoutInDisplayCutoutMode)
        }
    }

    @Test
    fun engineObserverNotifiesWebAppManifest() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)
        val manifest = WebAppManifest(
            name = "Minimal",
            startUrl = "/",
        )

        observer.onWebAppManifestLoaded(manifest)
        advanceUntilIdle()

        assertEquals(manifest, store.state.tabs[0].content.webAppManifest)
    }

    @Test
    fun engineSessionObserverWithContentPermissionRequests() = runTest {
        val permissionRequest: PermissionRequest = mock()
        val store: BrowserStore = mock()
        val observer = EngineObserver(
            tabId = "tab-id",
            store = store,
            scope = this,
        )
        val action = ContentAction.UpdatePermissionsRequest(
            "tab-id",
            permissionRequest,
        )
        observer.onContentPermissionRequest(permissionRequest)
        advanceUntilIdle()

        verify(store).dispatch(action)
    }

    @Test
    fun engineSessionObserverWithAppPermissionRequests() = runTest {
        val permissionRequest: PermissionRequest = mock()
        val store: BrowserStore = mock()
        val observer = EngineObserver(
            tabId = "tab-id",
            store = store,
            scope = this,
        )
        val action = ContentAction.UpdateAppPermissionsRequest(
            "tab-id",
            permissionRequest,
        )

        observer.onAppPermissionRequest(permissionRequest)
        advanceUntilIdle()

        verify(store).dispatch(action)
    }

    @Test
    fun engineObserverHandlesPromptRequest() = runTest {
        val promptRequest: PromptRequest = mock<PromptRequest.SingleChoice>()
        val store: BrowserStore = mock()
        val observer = EngineObserver(
            tabId = "tab-id",
            store = store,
            scope = this,
        )

        observer.onPromptRequest(promptRequest)
        advanceUntilIdle()

        verify(store).dispatch(
            ContentAction.UpdatePromptRequestAction(
                "tab-id",
                promptRequest,
            ),
        )
    }

    @Test
    fun engineObserverHandlesOnPromptUpdate() = runTest {
        val promptRequest: PromptRequest = mock<PromptRequest.SingleChoice>()
        val store: BrowserStore = mock()
        val observer = EngineObserver(
            tabId = "tab-id",
            store = store,
            scope = this,
        )
        val previousPromptUID = "prompt-uid"

        observer.onPromptUpdate(previousPromptUID, promptRequest)
        advanceUntilIdle()

        verify(store).dispatch(
            ContentAction.ReplacePromptRequestAction(
                "tab-id",
                previousPromptUID,
                promptRequest,
            ),
        )
    }

    @Test
    fun engineObserverHandlesWindowRequest() = runTest {
        val windowRequest: WindowRequest = mock()
        val store: BrowserStore = mock()
        whenever(store.state).thenReturn(mock())
        val observer = EngineObserver(
            tabId = "tab-id",
            store = store,
            scope = this,
        )

        observer.onWindowRequest(windowRequest)
        advanceUntilIdle()

        verify(store).dispatch(
            ContentAction.UpdateWindowRequestAction(
                "tab-id",
                windowRequest,
            ),
        )
    }

    @Test
    fun engineObserverHandlesFirstContentfulPaint() = runTest {
        val store: BrowserStore = mock()
        whenever(store.state).thenReturn(mock())
        val observer = createEngineObserver(
            tabId = "tab-id",
            store = store,
            scope = this,
        )

        observer.onFirstContentfulPaint()
        advanceUntilIdle()

        verify(store).dispatch(
            ContentAction.UpdateFirstContentfulPaintStateAction(
                "tab-id",
                true,
            ),
        )
    }

    @Test
    fun engineObserverHandlesPaintStatusReset() = runTest {
        val store: BrowserStore = mock()
        whenever(store.state).thenReturn(mock())
        val observer = EngineObserver(
            tabId = "tab-id",
            store = store,
            scope = this,
        )

        observer.onPaintStatusReset()
        advanceUntilIdle()

        verify(store).dispatch(
            ContentAction.UpdateFirstContentfulPaintStateAction(
                "tab-id",
                false,
            ),
        )
    }

    @Test
    fun engineObserverHandlesOnShowDynamicToolbar() = runTest {
        val store: BrowserStore = mock()
        val observer = EngineObserver(
            tabId = "tab-id",
            store = store,
            scope = this,
        )

        observer.onShowDynamicToolbar()
        advanceUntilIdle()

        verify(store).dispatch(ContentAction.UpdateExpandedToolbarStateAction("tab-id", true))
    }

    @Test
    fun `onMediaActivated will update the store`() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(
            tabId = "mozilla",
            store = store,
            scope = this,
        )
        val mediaSessionController: MediaSession.Controller = mock()

        assertNull(store.state.tabs[0].mediaSessionState)

        observer.onMediaActivated(mediaSessionController)
        advanceUntilIdle()

        val observedMediaSessionState = store.state.tabs[0].mediaSessionState
        assertNotNull(observedMediaSessionState)
        assertEquals(mediaSessionController, observedMediaSessionState?.controller)
    }

    @Test
    fun `onMediaDeactivated will update the store`() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                        mediaSessionState = MediaSessionState(
                            controller = mock(),
                        ),
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)

        assertNotNull(store.state.findTab("mozilla")?.mediaSessionState)

        observer.onMediaDeactivated()
        advanceUntilIdle()

        val observedMediaSessionState = store.state.findTab("mozilla")?.mediaSessionState
        assertNull(observedMediaSessionState)
    }

    @Test
    fun `onMediaMetadataChanged will update the store`() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                        mediaSessionState = MediaSessionState(
                            controller = mock(),
                        ),
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)
        val mediaSessionController: MediaSession.Controller = mock()
        val metaData: MediaSession.Metadata = mock()

        observer.onMediaActivated(mediaSessionController)
        observer.onMediaMetadataChanged(metaData)
        advanceUntilIdle()

        val observedMediaSessionState = store.state.findTab("mozilla")?.mediaSessionState
        assertNotNull(observedMediaSessionState)
        assertEquals(mediaSessionController, observedMediaSessionState?.controller)
        assertEquals(metaData, observedMediaSessionState?.metadata)
    }

    @Test
    fun `onMediaPlaybackStateChanged will update the store`() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                        mediaSessionState = MediaSessionState(
                            controller = mock(),
                        ),
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)
        val mediaSessionController: MediaSession.Controller = mock()
        val playbackState: MediaSession.PlaybackState = mock()

        observer.onMediaActivated(mediaSessionController)
        observer.onMediaPlaybackStateChanged(playbackState)
        advanceUntilIdle()

        val observedMediaSessionState = store.state.findTab("mozilla")?.mediaSessionState
        assertNotNull(observedMediaSessionState)
        assertEquals(mediaSessionController, observedMediaSessionState?.controller)
        assertEquals(playbackState, observedMediaSessionState?.playbackState)
    }

    @Test
    fun `onMediaFeatureChanged will update the store`() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                        mediaSessionState = MediaSessionState(
                            controller = mock(),
                        ),
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)
        val mediaSessionController: MediaSession.Controller = mock()
        val features: MediaSession.Feature = mock()

        observer.onMediaActivated(mediaSessionController)
        observer.onMediaFeatureChanged(features)
        advanceUntilIdle()

        val observedMediaSessionState = store.state.findTab("mozilla")?.mediaSessionState
        assertNotNull(observedMediaSessionState)
        assertEquals(mediaSessionController, observedMediaSessionState?.controller)
        assertEquals(features, observedMediaSessionState?.features)
    }

    @Test
    fun `onMediaPositionStateChanged will update the store`() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                        mediaSessionState = MediaSessionState(
                            controller = mock(),
                        ),
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)
        val mediaSessionController: MediaSession.Controller = mock()
        val positionState: MediaSession.PositionState = mock()

        observer.onMediaActivated(mediaSessionController)
        observer.onMediaPositionStateChanged(positionState)
        advanceUntilIdle()

        val observedMediaSessionState = store.state.findTab("mozilla")?.mediaSessionState
        assertNotNull(observedMediaSessionState)
        assertEquals(mediaSessionController, observedMediaSessionState?.controller)
        assertEquals(positionState, observedMediaSessionState?.positionState)
    }

    @Test
    fun `onMediaMuteChanged will update the store`() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                        mediaSessionState = MediaSessionState(
                            controller = mock(),
                        ),
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)
        val mediaSessionController: MediaSession.Controller = mock()

        observer.onMediaActivated(mediaSessionController)
        observer.onMediaMuteChanged(true)
        advanceUntilIdle()

        val observedMediaSessionState = store.state.findTab("mozilla")?.mediaSessionState
        assertNotNull(observedMediaSessionState)
        assertEquals(mediaSessionController, observedMediaSessionState?.controller)
        assertEquals(true, observedMediaSessionState?.muted)
    }

    @Test
    fun `onMediaFullscreenChanged will update the store`() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                        mediaSessionState = MediaSessionState(
                            controller = mock(),
                        ),
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)
        val mediaSessionController: MediaSession.Controller = mock()
        val elementMetadata: MediaSession.ElementMetadata = mock()

        observer.onMediaActivated(mediaSessionController)
        observer.onMediaFullscreenChanged(true, elementMetadata)
        advanceUntilIdle()

        val observedMediaSessionState = store.state.findTab("mozilla")?.mediaSessionState
        assertNotNull(observedMediaSessionState)
        assertEquals(mediaSessionController, observedMediaSessionState?.controller)
        assertEquals(true, observedMediaSessionState?.fullscreen)
        assertEquals(elementMetadata, observedMediaSessionState?.elementMetadata)
    }

    @Test
    fun `updates are ignored when media session is deactivated`() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)
        val elementMetadata: MediaSession.ElementMetadata = mock()

        observer.onMediaFullscreenChanged(true, elementMetadata)

        assertNull(store.state.findTab("mozilla")?.mediaSessionState)

        observer.onMediaMuteChanged(true)
        assertNull(store.state.findTab("mozilla")?.mediaSessionState)
    }

    @Test
    fun `onExternalResource will update the store`() = runTest {
        val response = mock<Response> {
            `when`(headers).thenReturn(MutableHeaders(listOf(Header(E_TAG, "12345"))))
        }

        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "mozilla",
                        mediaSessionState = MediaSessionState(
                            controller = mock(),
                        ),
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(store = store, scope = this)

        observer.onExternalResource(
            url = "mozilla.org/file.txt",
            fileName = "file.txt",
            userAgent = "userAgent",
            contentType = "text/plain",
            isPrivate = true,
            contentLength = 100L,
            response = response,
        )
        advanceUntilIdle()

        val tab = store.state.findTab("mozilla")!!

        assertEquals("mozilla.org/file.txt", tab.content.download?.url)
        assertEquals("file.txt", tab.content.download?.fileName)
        assertEquals("userAgent", tab.content.download?.userAgent)
        assertEquals("text/plain", tab.content.download?.contentType)
        assertEquals("12345", tab.content.download?.etag)
        assertEquals(100L, tab.content.download?.contentLength)
        assertEquals(true, tab.content.download?.private)
        assertEquals(response, tab.content.download?.response)
    }

    @Test
    fun `onExternalResource with negative contentLength`() = runTest {
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab(
                        url = "https://www.mozilla.org",
                        id = "test-tab",
                        mediaSessionState = MediaSessionState(
                            controller = mock(),
                        ),
                    ),
                ),
            ),
        )

        val observer = createEngineObserver(
            tabId = "test-tab",
            store = store,
            scope = this,
        )

        observer.onExternalResource(url = "mozilla.org/file.txt", contentLength = -1)

        val tab = store.state.findTab("test-tab")!!

        assertNull(tab.content.download?.contentLength)
    }

    @Test
    fun `onCrashStateChanged will update session and notify observer`() = runTest {
        val store: BrowserStore = mock()
        val observer = createEngineObserver(
            tabId = "test-id",
            store = store,
            scope = this,
        )

        observer.onCrash()
        advanceUntilIdle()

        verify(store).dispatch(
            CrashAction.SessionCrashedAction(
                "test-id",
            ),
        )
    }

    @Test
    fun `onLocationChange does not clear search terms`() = runTest {
        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            middleware = listOf(middleware),
        )

        val observer = createEngineObserver(
            tabId = "test-id",
            store = store,
            scope = this,
        )
        observer.onLocationChange("https://www.mozilla.org/en-US/", false)
        advanceUntilIdle()

        middleware.assertNotDispatched(ContentAction.UpdateSearchTermsAction::class)
    }

    @Test
    fun `onLoadRequest clears search terms for requests triggered by web content`() = runTest {
        val url = "https://www.mozilla.org"

        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            middleware = listOf(middleware),
        )

        val observer = createEngineObserver(
            tabId = "test-id",
            store = store,
            scope = this,
        )
        observer.onLoadRequest(url = url, triggeredByRedirect = false, triggeredByWebContent = true)
        advanceUntilIdle()

        middleware.assertFirstAction(ContentAction.UpdateSearchTermsAction::class) { action ->
            assertEquals("", action.searchTerms)
            assertEquals("test-id", action.sessionId)
        }
    }

    @Test
    @Suppress("DEPRECATION") // Session observable is deprecated
    fun `onLoadRequest notifies session observers`() = runTest {
        val url = "https://www.mozilla.org"
        val store: BrowserStore = mock()

        val observer = createEngineObserver(
            tabId = "test-id",
            store = store,
            scope = this,
        )
        observer.onLoadRequest(url = url, triggeredByRedirect = true, triggeredByWebContent = false)
        advanceUntilIdle()

        verify(store)
            .dispatch(
                ContentAction.UpdateLoadRequestAction(
                    "test-id",
                    LoadRequestState(url, triggeredByRedirect = true, triggeredByUser = false),
                ),
            )
    }

    @Test
    fun `onLoadRequest does not clear search terms for requests not triggered by user interacting with web content`() = runTest {
        val url = "https://www.mozilla.org"

        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            middleware = listOf(middleware),
        )

        val observer = createEngineObserver(
            tabId = "test-id",
            store = store,
            scope = this,
        )
        observer.onLoadRequest(url = url, triggeredByRedirect = false, triggeredByWebContent = false)
        advanceUntilIdle()

        middleware.assertNotDispatched(ContentAction.UpdateSearchTermsAction::class)
    }

    @Test
    fun `onLaunchIntentRequest dispatches UpdateAppIntentAction`() = runTest {
        val url = "https://www.mozilla.org"

        val store: BrowserStore = mock()
        val observer = createEngineObserver(
            tabId = "test-id",
            store = store,
            scope = this,
        )
        val intent: Intent = mock()
        observer.onLaunchIntentRequest(url = url, appIntent = intent, fallbackUrl = null, appName = null)
        advanceUntilIdle()

        verify(store).dispatch(ContentAction.UpdateAppIntentAction("test-id", AppIntentState(url, intent, null, null)))
    }

    @Test
    fun `onNavigateBack clears search terms when navigating back`() = runTest {
        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            middleware = listOf(middleware),
        )

        val observer = createEngineObserver(
            tabId = "test-id",
            store = store,
            scope = this,
        )
        observer.onNavigateBack()
        advanceUntilIdle()

        middleware.assertFirstAction(ContentAction.UpdateSearchTermsAction::class) { action ->
            assertEquals("", action.searchTerms)
            assertEquals("test-id", action.sessionId)
        }
    }

    @Test
    fun `WHEN navigating forward THEN search terms are cleared`() = runTest {
        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            middleware = listOf(middleware),
        )

        val observer = createEngineObserver(
            tabId = "test-id",
            store = store,
            scope = this,
        )
        observer.onNavigateForward()
        advanceUntilIdle()

        middleware.assertFirstAction(ContentAction.UpdateSearchTermsAction::class) { action ->
            assertEquals("", action.searchTerms)
            assertEquals("test-id", action.sessionId)
        }
    }

    @Test
    fun `WHEN navigating to history index THEN search terms are cleared`() = runTest {
        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            middleware = listOf(middleware),
        )

        val observer = createEngineObserver(
            tabId = "test-id",
            store = store,
            scope = this,
        )
        observer.onGotoHistoryIndex()
        advanceUntilIdle()

        middleware.assertFirstAction(ContentAction.UpdateSearchTermsAction::class) { action ->
            assertEquals("", action.searchTerms)
            assertEquals("test-id", action.sessionId)
        }
    }

    @Test
    fun `WHEN loading data THEN the search terms are cleared`() = runTest {
        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            middleware = listOf(middleware),
        )

        val observer = createEngineObserver(
            tabId = "test-id",
            store = store,
            scope = this,
        )
        observer.onLoadData()
        advanceUntilIdle()

        middleware.assertFirstAction(ContentAction.UpdateSearchTermsAction::class) { action ->
            assertEquals("", action.searchTerms)
            assertEquals("test-id", action.sessionId)
        }
    }

    @Test
    fun `GIVEN a search is not performed WHEN loading the URL THEN the search terms are cleared`() = runTest {
        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab("https://www.mozilla.org", id = "mozilla"),
                ),
            ),
            middleware = listOf(middleware),
        )

        store.dispatch(ContentAction.UpdateIsSearchAction("mozilla", false))

        val observer = createEngineObserver(
            tabId = "test-id",
            store = store,
            scope = this,
        )
        observer.onLoadUrl()
        advanceUntilIdle()

        middleware.assertLastAction(ContentAction.UpdateSearchTermsAction::class) { action ->
            assertEquals("", action.searchTerms)
            assertEquals("test-id", action.sessionId)
        }
    }

    @Test
    fun `GIVEN a search is performed WHEN loading the URL THEN the search terms are cleared`() = runTest {
        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab("https://www.mozilla.org", id = "test-id"),
                ),
            ),
            middleware = listOf(middleware),
        )

        store.dispatch(ContentAction.UpdateIsSearchAction("test-id", true))

        val observer = createEngineObserver(
            tabId = "test-id",
            store = store,
            scope = this,
        )
        observer.onLoadUrl()
        advanceUntilIdle()

        middleware.assertLastAction(ContentAction.UpdateIsSearchAction::class) { action ->
            assertEquals(false, action.isSearch)
            assertEquals("test-id", action.sessionId)
        }
    }

    @Test
    fun `GIVEN a search is performed WHEN the location is changed without user interaction THEN the search terms are not cleared`() = runTest {
        val middleware = CaptureActionsMiddleware<BrowserState, BrowserAction>()
        val store = BrowserStore(
            initialState = BrowserState(
                tabs = listOf(
                    createTab("https://www.mozilla.org", id = "test-id"),
                ),
            ),
            middleware = listOf(middleware),
        )

        store.dispatch(ContentAction.UpdateIsSearchAction("test-id", true))

        val observer = createEngineObserver(
            tabId = "test-id",
            store = store,
            scope = this,
        )
        observer.onLocationChange("testUrl", false)
        advanceUntilIdle()

        middleware.assertNotDispatched(ContentAction.UpdateSearchTermsAction::class)
    }

    @Test
    fun `onHistoryStateChanged dispatches UpdateHistoryStateAction`() = runTest {
        val store: BrowserStore = mock()
        val observer = createEngineObserver(
            tabId = "test-id",
            store = store,
            scope = this,
        )

        observer.onHistoryStateChanged(emptyList(), 0)
        advanceUntilIdle()

        verify(store).dispatch(
            ContentAction.UpdateHistoryStateAction(
                "test-id",
                emptyList(),
                currentIndex = 0,
            ),
        )

        observer.onHistoryStateChanged(
            listOf(
                HistoryItem("Firefox", "https://firefox.com"),
                HistoryItem("Mozilla", "http://mozilla.org"),
            ),
            1,
        )
        advanceUntilIdle()

        verify(store).dispatch(
            ContentAction.UpdateHistoryStateAction(
                "test-id",
                listOf(
                    HistoryItem("Firefox", "https://firefox.com"),
                    HistoryItem("Mozilla", "http://mozilla.org"),
                ),
                currentIndex = 1,
            ),
        )
    }

    @Test
    fun `onScrollChange dispatches UpdateReaderScrollYAction`() = runTest {
        val store: BrowserStore = mock()
        whenever(store.state).thenReturn(mock())
        val observer = createEngineObserver(
            tabId = "tab-id",
            store = store,
            scope = this,
        )

        observer.onScrollChange(4321, 1234)
        advanceUntilIdle()

        verify(store).dispatch(
            ReaderAction.UpdateReaderScrollYAction(
                "tab-id",
                1234,
            ),
        )
    }

    @Test
    fun `equality between tracking protection policies`() {
        val strict = EngineSession.TrackingProtectionPolicy.strict()
        val recommended = EngineSession.TrackingProtectionPolicy.recommended()
        val none = EngineSession.TrackingProtectionPolicy.none()
        val custom = EngineSession.TrackingProtectionPolicy.select(
            trackingCategories = emptyArray(),
            cookiePolicy = EngineSession.TrackingProtectionPolicy.CookiePolicy.ACCEPT_ONLY_FIRST_PARTY,
            cookiePurging = true,
            strictSocialTrackingProtection = true,
        )
        val custom2 = EngineSession.TrackingProtectionPolicy.select(
            trackingCategories = emptyArray(),
            cookiePolicy = EngineSession.TrackingProtectionPolicy.CookiePolicy.ACCEPT_ONLY_FIRST_PARTY,
            cookiePurging = true,
            strictSocialTrackingProtection = true,
        )

        val customNone = EngineSession.TrackingProtectionPolicy.select(
            trackingCategories = none.trackingCategories,
            cookiePolicy = none.cookiePolicy,
            cookiePurging = none.cookiePurging,
            strictSocialTrackingProtection = false,
        )

        assertTrue(strict == EngineSession.TrackingProtectionPolicy.strict())
        assertTrue(recommended == EngineSession.TrackingProtectionPolicy.recommended())
        assertTrue(none == EngineSession.TrackingProtectionPolicy.none())
        assertTrue(custom == custom2)

        assertFalse(strict == EngineSession.TrackingProtectionPolicy.strict().forPrivateSessionsOnly())
        assertFalse(recommended == EngineSession.TrackingProtectionPolicy.recommended().forPrivateSessionsOnly())
        assertFalse(custom == custom2.forPrivateSessionsOnly())

        assertFalse(strict == EngineSession.TrackingProtectionPolicy.strict().forRegularSessionsOnly())
        assertFalse(recommended == EngineSession.TrackingProtectionPolicy.recommended().forRegularSessionsOnly())
        assertFalse(custom == custom2.forRegularSessionsOnly())

        assertFalse(none == customNone)
    }

    private fun createEngineObserver(
        tabId: String = "mozilla",
        store: BrowserStore,
        scope: CoroutineScope,
    ): EngineObserver = EngineObserver(tabId, store, scope)
}
