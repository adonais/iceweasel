/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.state.engine.middleware

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import mozilla.components.browser.state.action.BrowserAction
import mozilla.components.browser.state.action.InitAction
import mozilla.components.browser.state.action.LocaleAction
import mozilla.components.browser.state.action.TranslationsAction
import mozilla.components.browser.state.state.BrowserState
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.browser.state.state.TranslationsBrowserState
import mozilla.components.browser.state.state.TranslationsState
import mozilla.components.browser.state.state.createTab
import mozilla.components.browser.state.store.BrowserStore
import mozilla.components.concept.engine.Engine
import mozilla.components.concept.engine.EngineSession
import mozilla.components.concept.engine.translate.DetectedLanguages
import mozilla.components.concept.engine.translate.Language
import mozilla.components.concept.engine.translate.LanguageModel
import mozilla.components.concept.engine.translate.LanguageSetting
import mozilla.components.concept.engine.translate.ModelManagementOptions
import mozilla.components.concept.engine.translate.ModelOperation
import mozilla.components.concept.engine.translate.ModelState
import mozilla.components.concept.engine.translate.OperationLevel
import mozilla.components.concept.engine.translate.TranslationDownloadSize
import mozilla.components.concept.engine.translate.TranslationEngineState
import mozilla.components.concept.engine.translate.TranslationError
import mozilla.components.concept.engine.translate.TranslationOperation
import mozilla.components.concept.engine.translate.TranslationPageSettingOperation
import mozilla.components.concept.engine.translate.TranslationPageSettings
import mozilla.components.concept.engine.translate.TranslationSupport
import mozilla.components.lib.state.MiddlewareContext
import mozilla.components.support.test.any
import mozilla.components.support.test.argumentCaptor
import mozilla.components.support.test.eq
import mozilla.components.support.test.mock
import mozilla.components.support.test.whenever
import org.junit.Before
import org.junit.Test
import org.mockito.ArgumentMatchers.anyBoolean
import org.mockito.Mockito.atLeastOnce
import org.mockito.Mockito.doReturn
import org.mockito.Mockito.never
import org.mockito.Mockito.spy
import org.mockito.Mockito.verify
import java.util.Locale

class TranslationsMiddlewareTest {

    private val scope = TestScope(StandardTestDispatcher())
    private lateinit var engine: Engine
    private lateinit var engineSession: EngineSession
    private lateinit var tab: TabSessionState
    private lateinit var translationsMiddleware: TranslationsMiddleware
    private lateinit var tabs: List<TabSessionState>
    private lateinit var state: BrowserState
    private lateinit var store: BrowserStore
    private lateinit var context: MiddlewareContext<BrowserState, BrowserAction>

    // Mock Variables
    private val mockFrom = Language(code = "es", localizedDisplayName = "Spanish")
    private val mockTo = Language(code = "en", localizedDisplayName = "English")
    private val mockSupportedLanguages = TranslationSupport(
        fromLanguages = listOf(mockFrom, mockTo),
        toLanguages = listOf(mockFrom, mockTo),
    )
    private val mockDownloaded = ModelState.DOWNLOADED
    private val mockSize: Long = 1234
    private val mockLanguage = Language(mockFrom.code, mockFrom.localizedDisplayName)
    private val mockLanguageModel = LanguageModel(mockLanguage, mockDownloaded, mockSize)
    private lateinit var mockLanguageModels: MutableList<LanguageModel>

    @Before
    fun setup() {
        engine = mock()
        engineSession = mock()
        tab = spy(
            createTab(
                url = "https://www.firefox.com",
                title = "Firefox",
                id = "1",
                engineSession = engineSession,
            ),
        )
        tabs = spy(listOf(tab))
        state = spy(BrowserState(tabs = tabs, selectedTabId = tab.id))
        translationsMiddleware = TranslationsMiddleware(engine = engine, scope = scope)
        store = spy(BrowserStore(middleware = listOf(translationsMiddleware), initialState = state))
        context = mock<MiddlewareContext<BrowserState, BrowserAction>>()

        whenever(context.store).thenReturn(store)
        whenever(context.state).thenReturn(state)

        mockLanguageModels = mutableListOf(mockLanguageModel)
    }

    /**
     * Use with tests that need a mock translations engine state and supported languages.
     */
    private fun setupMockState() {
        val mockDetectedLanguages = DetectedLanguages(
            documentLangTag = mockFrom.code,
            supportedDocumentLang = true,
            userPreferredLangTag = mockTo.code,
        )
        val mockSessionState = TranslationsState(
            translationEngineState = TranslationEngineState(mockDetectedLanguages),
        )

        val mockBrowserState = TranslationsBrowserState(isEngineSupported = true, supportedLanguages = mockSupportedLanguages, languageModels = mockLanguageModels)

        doReturn(mockSessionState).`when`(tab).translationsState
        doReturn(mockBrowserState).`when`(state).translationEngine
        whenever(store.state).thenReturn(state)
    }

    @Test
    fun `WHEN OperationRequestedAction is dispatched for FETCH_SUPPORTED_LANGUAGES AND succeeds THEN SetSupportedLanguagesAction is dispatched`() = runTest {
        // Initial Action
        val action =
            TranslationsAction.OperationRequestedAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_SUPPORTED_LANGUAGES,
            )

        translationsMiddleware.invoke(context = context, next = {}, action = action)
        scope.testScheduler.advanceUntilIdle()

        // Verify results
        val languageCallback = argumentCaptor<((TranslationSupport) -> Unit)>()
        // Verifying at least once because `InitAction` also occurred
        verify(engine, atLeastOnce()).getSupportedTranslationLanguages(onSuccess = languageCallback.capture(), onError = any())
        val supportedLanguages = TranslationSupport(
            fromLanguages = listOf(Language("en", "English")),
            toLanguages = listOf(Language("en", "English")),
        )
        languageCallback.value.invoke(supportedLanguages)

        scope.testScheduler.advanceUntilIdle()

        verify(context.store, atLeastOnce()).dispatch(
            TranslationsAction.SetSupportedLanguagesAction(
                supportedLanguages = supportedLanguages,
            ),
        )

        verify(context.store, atLeastOnce()).dispatch(
            TranslationsAction.TranslateSuccessAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_SUPPORTED_LANGUAGES,
            ),
        )
    }

    @Test
    fun `WHEN OperationRequestedAction is dispatched for FETCH_SUPPORTED_LANGUAGES AND fails THEN EngineExceptionAction is dispatched`() {
        // Initial Action
        val action =
            TranslationsAction.OperationRequestedAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_SUPPORTED_LANGUAGES,
            )

        translationsMiddleware.invoke(context = context, next = {}, action = action)
        scope.testScheduler.advanceUntilIdle()

        // Verify results
        val errorCaptor = argumentCaptor<((Throwable) -> Unit)>()
        // Verifying at least once because `InitAction` also occurred
        verify(engine, atLeastOnce()).getSupportedTranslationLanguages(onSuccess = any(), onError = errorCaptor.capture())
        errorCaptor.value.invoke(Throwable())

        scope.testScheduler.advanceUntilIdle()

        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.EngineExceptionAction(
                error = TranslationError.CouldNotLoadLanguagesError(any()),
            ),
        )

        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.TranslateExceptionAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_SUPPORTED_LANGUAGES,
                translationError = TranslationError.CouldNotLoadLanguagesError(any()),
            ),
        )
    }

    @Test
    fun `WHEN InitAction is dispatched THEN InitTranslationsBrowserState is also dispatched`() = runTest {
        // Send Action
        // Note: Will cause a double InitAction
        translationsMiddleware.invoke(context = context, next = {}, action = InitAction)
        scope.testScheduler.advanceUntilIdle()

        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.InitTranslationsBrowserState,
        )
    }

    @Test
    fun `GIVEN automaticallyInitialize is false WHEN InitAction is dispatched THEN do nothing`() = runTest {
        val middleware = TranslationsMiddleware(
            engine = engine,
            automaticallyInitialize = false,
            scope = scope,
        )
        middleware.invoke(context = context, next = {}, action = InitAction)
        scope.testScheduler.advanceUntilIdle()

        verify(store, never()).dispatch(
            TranslationsAction.InitTranslationsBrowserState,
        )
    }

    @Test
    fun `WHEN InitTranslationsBrowserState is dispatched AND the engine is supported THEN SetSupportedLanguagesAction is also dispatched`() = runTest {
        // Send Action
        translationsMiddleware.invoke(context = context, next = {}, action = TranslationsAction.InitTranslationsBrowserState)
        scope.testScheduler.advanceUntilIdle()

        // Set the engine to support
        val engineSupportedCallback = argumentCaptor<((Boolean) -> Unit)>()
        // At least once, since InitAction also will trigger this
        verify(engine, atLeastOnce()).isTranslationsEngineSupported(
            onSuccess = engineSupportedCallback.capture(),
            onError = any(),
        )
        engineSupportedCallback.value.invoke(true)
        scope.testScheduler.advanceUntilIdle()

        // Verify results for language query
        val languageCallback = argumentCaptor<((TranslationSupport) -> Unit)>()
        verify(engine, atLeastOnce()).getSupportedTranslationLanguages(onSuccess = languageCallback.capture(), onError = any())
        val supportedLanguages = TranslationSupport(
            fromLanguages = listOf(Language("en", "English")),
            toLanguages = listOf(Language("en", "English")),
        )
        languageCallback.value.invoke(supportedLanguages)

        scope.testScheduler.advanceUntilIdle()

        // Verifying at least once
        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.SetSupportedLanguagesAction(
                supportedLanguages = supportedLanguages,
            ),
        )
    }

    @Test
    fun `WHEN InitTranslationsBrowserState is dispatched AND the engine is supported THEN SetLanguageSettingsAction is also dispatched`() = runTest {
        // Send Action
        translationsMiddleware.invoke(context = context, next = {}, action = TranslationsAction.InitTranslationsBrowserState)
        scope.testScheduler.advanceUntilIdle()

        // Set the engine to support
        val engineSupportedCallback = argumentCaptor<((Boolean) -> Unit)>()
        // At least once, since InitAction also will trigger this
        verify(engine, atLeastOnce()).isTranslationsEngineSupported(
            onSuccess = engineSupportedCallback.capture(),
            onError = any(),
        )
        engineSupportedCallback.value.invoke(true)
        scope.testScheduler.advanceUntilIdle()

        // Check expectations
        val languageSettingsCallback = argumentCaptor<((Map<String, LanguageSetting>) -> Unit)>()
        verify(engine, atLeastOnce()).getLanguageSettings(
            onSuccess = languageSettingsCallback.capture(),
            onError = any(),
        )
        val mockLanguageSetting = mapOf("en" to LanguageSetting.OFFER)
        languageSettingsCallback.value.invoke(mockLanguageSetting)
        scope.testScheduler.advanceUntilIdle()

        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.SetLanguageSettingsAction(
                languageSettings = mockLanguageSetting,
            ),
        )
    }

    @Test
    fun `WHEN InitTranslationsBrowserState is dispatched AND an error occurs THEN TranslateExceptionAction is dispatched for language settings`() = runTest {
        // Send Action
        translationsMiddleware.invoke(context = context, next = {}, action = TranslationsAction.InitTranslationsBrowserState)
        scope.testScheduler.advanceUntilIdle()

        // Set the engine to support
        val engineSupportedCallback = argumentCaptor<((Boolean) -> Unit)>()
        // At least once, since InitAction also will trigger this
        verify(engine, atLeastOnce()).isTranslationsEngineSupported(
            onSuccess = engineSupportedCallback.capture(),
            onError = any(),
        )
        engineSupportedCallback.value.invoke(true)
        scope.testScheduler.advanceUntilIdle()

        // Check expectations
        val errorCallback = argumentCaptor<((Throwable) -> Unit)>()
        verify(engine, atLeastOnce()).getLanguageSettings(
            onSuccess = any(),
            onError = errorCallback.capture(),
        )
        errorCallback.value.invoke(Throwable())
        scope.testScheduler.advanceUntilIdle()

        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.EngineExceptionAction(
                error = TranslationError.CouldNotLoadLanguageSettingsError(any()),
            ),
        )
    }

    @Test
    fun `WHEN InitTranslationsBrowserState is dispatched AND the engine is supported THEN SetLanguageModelsAction is also dispatched`() = runTest {
        // Send Action
        translationsMiddleware.invoke(context = context, next = {}, action = TranslationsAction.InitTranslationsBrowserState)
        scope.testScheduler.advanceUntilIdle()
        // Set the engine to support
        val engineSupportedCallback = argumentCaptor<((Boolean) -> Unit)>()
        // At least once, since InitAction also will trigger this
        verify(engine, atLeastOnce()).isTranslationsEngineSupported(
            onSuccess = engineSupportedCallback.capture(),
            onError = any(),
        )
        engineSupportedCallback.value.invoke(true)
        scope.testScheduler.advanceUntilIdle()

        val languageCallback = argumentCaptor<((List<LanguageModel>) -> Unit)>()
        verify(engine, atLeastOnce()).getTranslationsModelDownloadStates(onSuccess = languageCallback.capture(), onError = any())
        languageCallback.value.invoke(mockLanguageModels)

        // Verifying at least once
        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.SetLanguageModelsAction(
                languageModels = mockLanguageModels,
            ),
        )
    }

    @Test
    fun `WHEN InitTranslationsBrowserState is dispatched AND the engine is supported THEN SetNeverTranslateSitesAction is also dispatched`() = runTest {
        // Send Action
        translationsMiddleware.invoke(context = context, next = {}, action = TranslationsAction.InitTranslationsBrowserState)
        scope.testScheduler.advanceUntilIdle()

        // Set the engine to support
        val engineSupportedCallback = argumentCaptor<((Boolean) -> Unit)>()
        // At least once, since InitAction also will trigger this
        verify(engine, atLeastOnce()).isTranslationsEngineSupported(
            onSuccess = engineSupportedCallback.capture(),
            onError = any(),
        )
        engineSupportedCallback.value.invoke(true)
        scope.testScheduler.advanceUntilIdle()

        val neverTranslateSitesCallBack = argumentCaptor<((List<String>) -> Unit)>()
        verify(engine, atLeastOnce()).getNeverTranslateSiteList(onSuccess = neverTranslateSitesCallBack.capture(), onError = any())
        val mockNeverTranslate = listOf("www.mozilla.org")
        neverTranslateSitesCallBack.value.invoke(mockNeverTranslate)

        // Verifying at least once
        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.SetNeverTranslateSitesAction(
                neverTranslateSites = mockNeverTranslate,
            ),
        )
    }

    @Test
    fun `WHEN InitTranslationsBrowserState is dispatched AND has an issue with the engine THEN EngineExceptionAction is dispatched`() = runTest {
        // Send Action
        // Note: Implicitly called once due to connection with InitAction
        translationsMiddleware.invoke(context = context, next = {}, action = TranslationsAction.InitTranslationsBrowserState)
        scope.testScheduler.advanceUntilIdle()

        // Check expectations
        val errorCallback = argumentCaptor<((Throwable) -> Unit)>()
        verify(engine, atLeastOnce()).isTranslationsEngineSupported(
            onSuccess = any(),
            onError = errorCallback.capture(),
        )
        errorCallback.value.invoke(IllegalStateException())
        scope.testScheduler.advanceUntilIdle()

        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.EngineExceptionAction(
                error = TranslationError.UnknownEngineSupportError(any()),
            ),
        )
    }

    @Test
    fun `WHEN InitTranslationsBrowserState is dispatched AND the engine is not supported THEN SetSupportedLanguagesAction and SetLanguageModelsAction are NOT dispatched`() = runTest {
        // Send Action
        // Will invoke a double InitAction
        translationsMiddleware.invoke(context = context, next = {}, action = TranslationsAction.InitTranslationsBrowserState)
        scope.testScheduler.advanceUntilIdle()

        // Set the engine to not support
        val engineNotSupportedCallback = argumentCaptor<((Boolean) -> Unit)>()
        verify(engine, atLeastOnce()).isTranslationsEngineSupported(
            onSuccess = engineNotSupportedCallback.capture(),
            onError = any(),
        )
        engineNotSupportedCallback.value.invoke(false)

        // Verify language query was never called
        verify(engine, never()).getSupportedTranslationLanguages(onSuccess = any(), onError = any())
    }

    @Test
    fun `WHEN TranslateExpectedAction is dispatched THEN FetchTranslationDownloadSizeAction is also dispatched`() = runTest {
        // Set up the state of defaults on the engine.
        setupMockState()

        // Action
        translationsMiddleware.invoke(context = context, next = {}, action = TranslationsAction.TranslateExpectedAction(tab.id))

        scope.testScheduler.advanceUntilIdle()

        // Verifying at least once
        verify(store).dispatch(
            TranslationsAction.FetchTranslationDownloadSizeAction(
                tabId = tab.id,
                fromLanguage = mockFrom,
                toLanguage = mockTo,
            ),
        )
    }

    @Test
    fun `WHEN TranslateExpectedAction is dispatched AND the defaults are NOT available THEN FetchTranslationDownloadSizeAction is NOT dispatched`() = runTest {
        // Note, no state is set on the engine, so no default values are available.
        // Action
        translationsMiddleware.invoke(context = context, next = {}, action = TranslationsAction.TranslateExpectedAction(tab.id))

        scope.testScheduler.advanceUntilIdle()

        // Verifying no dispatch
        verify(store, never()).dispatch(
            TranslationsAction.FetchTranslationDownloadSizeAction(
                tabId = tab.id,
                fromLanguage = mockFrom,
                toLanguage = mockTo,
            ),
        )

        scope.testScheduler.advanceUntilIdle()

        // Verify language query was never called
        verify(engine, never()).getTranslationsModelDownloadStates(onSuccess = any(), onError = any())
    }

    @Test
    fun `WHEN OperationRequestedAction is dispatched WITH FETCH_PAGE_SETTINGS AND fetching settings is successful THEN TranslationPageSettings is dispatched`() = runTest {
        // Setup
        setupMockState()

        val mockPageSettings = TranslationPageSettings(
            alwaysOfferPopup = true,
            alwaysTranslateLanguage = true,
            neverTranslateLanguage = false,
            neverTranslateSite = true,
        )

        whenever(engine.getTranslationsOfferPopup()).thenAnswer { mockPageSettings.alwaysOfferPopup }

        // Send Action
        val action =
            TranslationsAction.OperationRequestedAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_PAGE_SETTINGS,
            )
        translationsMiddleware.invoke(context, {}, action)
        scope.testScheduler.advanceUntilIdle()

        // Check Behavior
        // Popup always offer behavior
        verify(engine).getTranslationsOfferPopup()

        // Page language behavior
        val languageSettingCallback = argumentCaptor<((LanguageSetting) -> Unit)>()
        verify(engine).getLanguageSetting(
            languageCode = any(),
            onSuccess = languageSettingCallback.capture(),
            onError = any(),
        )
        val languageResponse = LanguageSetting.ALWAYS
        languageSettingCallback.value.invoke(languageResponse)
        scope.testScheduler.advanceUntilIdle()

        // Never translate site behavior behavior
        val neverTranslateSiteCallback = argumentCaptor<((Boolean) -> Unit)>()
        verify(engineSession).getNeverTranslateSiteSetting(
            onResult = neverTranslateSiteCallback.capture(),
            onException = any(),
        )
        neverTranslateSiteCallback.value.invoke(mockPageSettings.neverTranslateSite!!)
        scope.testScheduler.advanceUntilIdle()

        verify(store).dispatch(
            TranslationsAction.SetPageSettingsAction(
                tabId = tab.id,
                pageSettings = mockPageSettings,
            ),
        )
    }

    @Test
    fun `WHEN OperationRequestedAction WITH FETCH_PAGE_SETTINGS AND fetching settings fails THEN TranslateExceptionAction is dispatched`() {
        // Setup
        setupMockState()
        whenever(engine.getTranslationsOfferPopup()).thenAnswer { false }

        // Send Action
        val action =
            TranslationsAction.OperationRequestedAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_PAGE_SETTINGS,
            )
        translationsMiddleware.invoke(context, {}, action)
        scope.testScheduler.advanceUntilIdle()

        // Check Behavior
        // Page language behavior
        val languageErrorCallback = argumentCaptor<((Throwable) -> Unit)>()
        verify(engine).getLanguageSetting(
            languageCode = any(),
            onSuccess = any(),
            onError = languageErrorCallback.capture(),
        )
        languageErrorCallback.value.invoke(Throwable())
        scope.testScheduler.advanceUntilIdle()

        // Never translate site behavior behavior
        val neverTranslateSiteErrorCallback = argumentCaptor<((Throwable) -> Unit)>()
        verify(engineSession).getNeverTranslateSiteSetting(
            onResult = any(),
            onException = neverTranslateSiteErrorCallback.capture(),
        )
        neverTranslateSiteErrorCallback.value.invoke(Throwable())
        scope.testScheduler.advanceUntilIdle()

        verify(store).dispatch(
            TranslationsAction.TranslateExceptionAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_PAGE_SETTINGS,
                translationError = TranslationError.CouldNotLoadPageSettingsError(any()),
            ),
        )
    }

    @Test
    fun `WHEN UpdatePageSettingAction is dispatched WITH UPDATE_ALWAYS_TRANSLATE_LANGUAGE AND updating the setting is unsuccessful THEN OperationRequestedAction with FETCH_PAGE_SETTINGS is dispatched`() = runTest {
        // Setup
        setupMockState()
        val errorCallback = argumentCaptor<((Throwable) -> Unit)>()
        whenever(
            engine.setLanguageSetting(
                languageCode = any(),
                languageSetting = any(),
                onSuccess = any(),
                onError = errorCallback.capture(),
            ),
        ).thenAnswer { errorCallback.value.invoke(Throwable()) }

        // Send Action
        val action =
            TranslationsAction.UpdatePageSettingAction(
                tabId = tab.id,
                operation = TranslationPageSettingOperation.UPDATE_ALWAYS_TRANSLATE_LANGUAGE,
                setting = true,
            )
        translationsMiddleware.invoke(context, {}, action)
        scope.testScheduler.advanceUntilIdle()

        // Verify Dispatch
        verify(store).dispatch(
            TranslationsAction.OperationRequestedAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_PAGE_SETTINGS,
            ),
        )
    }

    @Test
    fun `WHEN an Operation to FETCH_AUTOMATIC_LANGUAGE_SETTINGS is dispatched THEN SetLanguageSettingsAction is dispatched`() = runTest {
        // Send Action
        val action =
            TranslationsAction.OperationRequestedAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_AUTOMATIC_LANGUAGE_SETTINGS,
            )
        translationsMiddleware.invoke(context = context, next = {}, action = action)
        scope.testScheduler.advanceUntilIdle()

        // Check expectations
        val languageSettingsCallback = argumentCaptor<((Map<String, LanguageSetting>) -> Unit)>()
        // Checking atLeastOnce, because InitAction is also implicitly called earlier
        verify(engine, atLeastOnce()).getLanguageSettings(
            onSuccess = languageSettingsCallback.capture(),
            onError = any(),
        )
        val mockLanguageSetting = mapOf("en" to LanguageSetting.OFFER)
        languageSettingsCallback.value.invoke(mockLanguageSetting)
        scope.testScheduler.advanceUntilIdle()

        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.SetLanguageSettingsAction(
                languageSettings = mockLanguageSetting,
            ),
        )
    }

    @Test
    fun `WHEN an Operation to UpdatePageSettings for UPDATE_ALWAYS_TRANSLATE_LANGUAGE is dispatched THEN SetLanguageSettingsAction is dispatched`() = runTest {
        // Page settings needs additional setup
        setupMockState()
        val pageSettingCallback = argumentCaptor<(() -> Unit)>()

        // This is going to execute onSuccess callback when setLanguageSetting is called
        whenever(
            engine.setLanguageSetting(
                languageCode = any(),
                languageSetting = any(),
                onSuccess = pageSettingCallback.capture(),
                onError = any(),
            ),
        ).thenAnswer { pageSettingCallback.value.invoke() }

        // Send Action
        val action =
            TranslationsAction.UpdatePageSettingAction(
                tabId = tab.id,
                operation = TranslationPageSettingOperation.UPDATE_ALWAYS_TRANSLATE_LANGUAGE,
                setting = true,
            )
        translationsMiddleware.invoke(context = context, next = {}, action = action)
        scope.testScheduler.advanceUntilIdle()

        // Check expectations

        verify(engine).setLanguageSetting(
            languageCode = eq("es"),
            languageSetting = eq(LanguageSetting.ALWAYS),
            onSuccess = pageSettingCallback.capture(),
            onError = any(),
        )

        // the success callback is going to be executed, which will trigger a FETCH_AUTOMATIC_LANGUAGE_SETTINGS action
        verify(context.store).dispatch(
            TranslationsAction.OperationRequestedAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_AUTOMATIC_LANGUAGE_SETTINGS,
            ),
        )

        scope.testScheduler.advanceUntilIdle()

        verify(engine).getLanguageSettings(
            onSuccess = any(),
            onError = any(),
        )
    }

    @Test
    fun `WHEN an Operation to FETCH_AUTOMATIC_LANGUAGE_SETTINGS has an error THEN EngineExceptionAction and TranslateExceptionAction are dispatched for language setting`() = runTest {
        // Send Action
        val action =
            TranslationsAction.OperationRequestedAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_AUTOMATIC_LANGUAGE_SETTINGS,
            )
        translationsMiddleware.invoke(context = context, next = {}, action = action)
        scope.testScheduler.advanceUntilIdle()

        // Check expectations
        val errorCallback = argumentCaptor<((Throwable) -> Unit)>()
        verify(engine, atLeastOnce()).getLanguageSettings(
            onSuccess = any(),
            onError = errorCallback.capture(),
        )
        errorCallback.value.invoke(Throwable())
        scope.testScheduler.advanceUntilIdle()

        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.EngineExceptionAction(
                error = TranslationError.CouldNotLoadLanguageSettingsError(any()),
            ),
        )

        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.TranslateExceptionAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_AUTOMATIC_LANGUAGE_SETTINGS,
                translationError = TranslationError.CouldNotLoadLanguageSettingsError(any()),
            ),
        )
    }

    @Test
    fun `WHEN UpdatePageSettingAction is dispatched WITH UPDATE_NEVER_TRANSLATE_LANGUAGE AND updating the setting is unsuccessful THEN OperationRequestedAction with FETCH_PAGE_SETTINGS is dispatched`() = runTest {
        // Setup
        setupMockState()
        val errorCallback = argumentCaptor<((Throwable) -> Unit)>()
        whenever(
            engine.setLanguageSetting(
                languageCode = any(),
                languageSetting = any(),
                onSuccess = any(),
                onError = errorCallback.capture(),
            ),
        )
            .thenAnswer { errorCallback.value.invoke(Throwable()) }

        // Send Action
        val action =
            TranslationsAction.UpdatePageSettingAction(
                tabId = tab.id,
                operation = TranslationPageSettingOperation.UPDATE_NEVER_TRANSLATE_LANGUAGE,
                setting = true,
            )
        translationsMiddleware.invoke(context, {}, action)
        scope.testScheduler.advanceUntilIdle()

        // Verify Dispatch
        verify(store).dispatch(
            TranslationsAction.OperationRequestedAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_PAGE_SETTINGS,
            ),
        )
    }

    @Test
    fun `WHEN UpdatePageSettingAction is dispatched WITH UPDATE_NEVER_TRANSLATE_SITE AND updating the setting is unsuccessful THEN OperationRequestedAction with FETCH_PAGE_SETTINGS is dispatched`() = runTest {
        // Setup
        setupMockState()
        val errorCallback = argumentCaptor<((Throwable) -> Unit)>()
        whenever(
            engineSession.setNeverTranslateSiteSetting(
                setting = anyBoolean(),
                onResult = any(),
                onException = errorCallback.capture(),
            ),
        )
            .thenAnswer { errorCallback.value.invoke(Throwable()) }

        // Send Action
        val action =
            TranslationsAction.UpdatePageSettingAction(
                tabId = tab.id,
                operation = TranslationPageSettingOperation.UPDATE_NEVER_TRANSLATE_SITE,
                setting = true,
            )
        translationsMiddleware.invoke(context, {}, action)
        scope.testScheduler.advanceUntilIdle()

        // Verify Dispatch
        verify(store).dispatch(
            TranslationsAction.OperationRequestedAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_PAGE_SETTINGS,
            ),
        )
    }

    @Test
    fun `WHEN OperationRequestedAction is dispatched to fetch never translate sites AND succeeds THEN SetNeverTranslateSitesAction is dispatched`() = runTest {
        val neverTranslateSites = listOf("google.com")
        val sitesCallback = argumentCaptor<((List<String>) -> Unit)>()
        val action =
            TranslationsAction.OperationRequestedAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_NEVER_TRANSLATE_SITES,
            )
        translationsMiddleware.invoke(context, {}, action)
        scope.testScheduler.advanceUntilIdle()

        verify(engine).getNeverTranslateSiteList(onSuccess = sitesCallback.capture(), onError = any())
        sitesCallback.value.invoke(neverTranslateSites)

        verify(context.store).dispatch(
            TranslationsAction.SetNeverTranslateSitesAction(
                neverTranslateSites = neverTranslateSites,
            ),
        )
    }

    @Test
    fun `WHEN OperationRequestedAction is dispatched to fetch never translate sites AND fails THEN TranslateExceptionAction is dispatched`() = runTest {
        store.dispatch(
            TranslationsAction.OperationRequestedAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_NEVER_TRANSLATE_SITES,
            ),
        )
        scope.testScheduler.advanceUntilIdle()

        verify(store).dispatch(
            TranslationsAction.TranslateExceptionAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_NEVER_TRANSLATE_SITES,
                translationError = TranslationError.CouldNotLoadNeverTranslateSites(any()),
            ),
        )
    }

    @Test
    fun `WHEN FetchTranslationDownloadSize is requested AND succeeds THEN SetTranslationDownloadSize is dispatched`() = runTest {
        val translationSize = TranslationDownloadSize(
            fromLanguage = Language("en", "English"),
            toLanguage = Language("fr", "French"),
            size = 10000L,
            error = null,
        )

        val action =
            TranslationsAction.FetchTranslationDownloadSizeAction(
                tabId = tab.id,
                fromLanguage = translationSize.fromLanguage,
                toLanguage = translationSize.toLanguage,
            )
        translationsMiddleware.invoke(context = context, next = {}, action = action)
        scope.testScheduler.advanceUntilIdle()

        val sizeCaptor = argumentCaptor<((Long) -> Unit)>()
        verify(engine).getTranslationsPairDownloadSize(
            fromLanguage = any(),
            toLanguage = any(),
            onSuccess = sizeCaptor.capture(),
            onError = any(),
        )
        sizeCaptor.value.invoke(translationSize.size!!)

        verify(context.store).dispatch(
            TranslationsAction.SetTranslationDownloadSizeAction(
                tabId = tab.id,
                translationSize = translationSize,
            ),
        )
    }

    @Test
    fun `WHEN FetchTranslationDownloadSize is requested AND fails THEN SetTranslationDownloadSize is dispatched`() = runTest {
        val action =
            TranslationsAction.FetchTranslationDownloadSizeAction(
                tabId = tab.id,
                fromLanguage = Language("en", "English"),
                toLanguage = Language("fr", "French"),
            )
        translationsMiddleware.invoke(context = context, next = {}, action = action)
        scope.testScheduler.advanceUntilIdle()

        val errorCaptor = argumentCaptor<((Throwable) -> Unit)>()
        verify(engine).getTranslationsPairDownloadSize(
            fromLanguage = any(),
            toLanguage = any(),
            onSuccess = any(),
            onError = errorCaptor.capture(),
        )
        errorCaptor.value.invoke(TranslationError.CouldNotDetermineDownloadSizeError(cause = null))
        scope.testScheduler.advanceUntilIdle()

        verify(context.store).dispatch(
            TranslationsAction.SetTranslationDownloadSizeAction(
                tabId = tab.id,
                translationSize = TranslationDownloadSize(
                    fromLanguage = Language("en", "English"),
                    toLanguage = Language("fr", "French"),
                    size = null,
                    error = any(),
                ),
            ),
        )
    }

    @Test
    fun `WHEN RemoveNeverTranslateSiteAction is dispatched AND removing is unsuccessful THEN SetNeverTranslateSitesAction is dispatched`() = runTest {
        val errorCallback = argumentCaptor<((Throwable) -> Unit)>()
        whenever(
            engine.setNeverTranslateSpecifiedSite(
                origin = any(),
                setting = anyBoolean(),
                onSuccess = any(),
                onError = errorCallback.capture(),
            ),
        ).thenAnswer { errorCallback.value.invoke(Throwable()) }

        val action =
            TranslationsAction.RemoveNeverTranslateSiteAction(
                origin = "google.com",
            )
        translationsMiddleware.invoke(context, {}, action)
        scope.testScheduler.advanceUntilIdle()

        val neverTranslateSitesCallBack = argumentCaptor<((List<String>) -> Unit)>()
        verify(engine, atLeastOnce()).getNeverTranslateSiteList(onSuccess = neverTranslateSitesCallBack.capture(), onError = any())
        val mockNeverTranslate = listOf("www.mozilla.org")
        neverTranslateSitesCallBack.value.invoke(mockNeverTranslate)

        // Verify Dispatch
        verify(store).dispatch(
            TranslationsAction.SetNeverTranslateSitesAction(
                neverTranslateSites = mockNeverTranslate,
            ),
        )
    }

    @Test
    fun `WHEN OperationRequestedAction is dispatched to FETCH_LANGUAGE_MODELS AND succeeds THEN SetLanguageModelsAction is dispatched`() = runTest {
        val languageCallback = argumentCaptor<((List<LanguageModel>) -> Unit)>()

        // Initial Action
        val action =
            TranslationsAction.OperationRequestedAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_LANGUAGE_MODELS,
            )
        translationsMiddleware.invoke(context, {}, action)
        scope.testScheduler.advanceUntilIdle()

        // Verify results
        verify(engine, atLeastOnce()).getTranslationsModelDownloadStates(onSuccess = languageCallback.capture(), onError = any())
        languageCallback.value.invoke(mockLanguageModels)

        verify(context.store, atLeastOnce()).dispatch(
            TranslationsAction.SetLanguageModelsAction(
                languageModels = mockLanguageModels,
            ),
        )
    }

    @Test
    fun `WHEN OperationRequestedAction is dispatched to FETCH_LANGUAGE_MODELS AND fails THEN TranslateExceptionAction is dispatched`() = runTest {
        val errorCallback = argumentCaptor<((Throwable) -> Unit)>()
        whenever(
            engine.getTranslationsModelDownloadStates(
                onSuccess = any(),
                onError = errorCallback.capture(),
            ),
        ).thenAnswer { errorCallback.value.invoke(Throwable()) }

        val action =
            TranslationsAction.OperationRequestedAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_LANGUAGE_MODELS,
            )
        translationsMiddleware.invoke(context, {}, action)
        scope.testScheduler.advanceUntilIdle()

        // Verify Dispatch
        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.EngineExceptionAction(
                error = TranslationError.ModelCouldNotRetrieveError(any()),
            ),
        )

        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.TranslateExceptionAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_LANGUAGE_MODELS,
                translationError = TranslationError.ModelCouldNotRetrieveError(any()),
            ),
        )
    }

    @Test
    fun `WHEN InitTranslationsBrowserState is dispatched AND the engine is supported THEN SetOfferTranslateSettingAction is also dispatched`() = runTest {
        // Send Action
        translationsMiddleware.invoke(context = context, next = {}, action = TranslationsAction.InitTranslationsBrowserState)
        scope.testScheduler.advanceUntilIdle()

        // Set the engine to support
        val engineSupportedCallback = argumentCaptor<((Boolean) -> Unit)>()
        // At least once, since InitAction also will trigger this
        verify(engine, atLeastOnce()).isTranslationsEngineSupported(
            onSuccess = engineSupportedCallback.capture(),
            onError = any(),
        )
        engineSupportedCallback.value.invoke(true)
        scope.testScheduler.advanceUntilIdle()

        // Verify results for offer
        verify(engine, atLeastOnce()).getTranslationsOfferPopup()
        scope.testScheduler.advanceUntilIdle()

        // Verifying at least once
        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.SetGlobalOfferTranslateSettingAction(
                offerTranslation = false,
            ),
        )
    }

    @Test
    fun `WHEN FETCH_OFFER_SETTING is dispatched with a tab id THEN SetOfferTranslateSettingAction and SetPageSettingsAction are also dispatched`() = runTest {
        // Set the mock offer value
        whenever(
            engine.getTranslationsOfferPopup(),
        ).thenAnswer { true }

        // Send Action
        val action =
            TranslationsAction.OperationRequestedAction(
                tabId = tab.id,
                operation = TranslationOperation.FETCH_OFFER_SETTING,
            )
        translationsMiddleware.invoke(context, {}, action)
        scope.testScheduler.advanceUntilIdle()

        // Verify Dispatch
        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.SetGlobalOfferTranslateSettingAction(
                offerTranslation = true,
            ),
        )

        // Since we had a tabId, this call will also happen
        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.SetPageSettingsAction(
                tabId = tab.id,
                pageSettings = any(),
            ),
        )
    }

    @Test
    fun `WHEN UpdateOfferTranslateSettingAction is called then setTranslationsOfferPopup is called on the engine`() = runTest {
        // Send Action
        val action =
            TranslationsAction.UpdateGlobalOfferTranslateSettingAction(
                offerTranslation = true,
            )
        translationsMiddleware.invoke(context, {}, action)
        scope.testScheduler.advanceUntilIdle()

        // Verify offer was set
        verify(engine, atLeastOnce()).setTranslationsOfferPopup(offer = true)
    }

    @Test
    fun `WHEN UpdateLanguageSettingsAction is dispatched and fails THEN SetLanguageSettingsAction is dispatched`() = runTest {
        // Send Action
        val action =
            TranslationsAction.UpdateLanguageSettingsAction(
                languageCode = "es",
                setting = LanguageSetting.ALWAYS,
            )
        translationsMiddleware.invoke(context, {}, action)

        scope.testScheduler.advanceUntilIdle()

        // Mock engine error
        val updateLanguagesErrorCallback = argumentCaptor<((Throwable) -> Unit)>()
        verify(engine).setLanguageSetting(
            languageCode = any(),
            languageSetting = any(),
            onSuccess = any(),
            onError = updateLanguagesErrorCallback.capture(),
        )
        updateLanguagesErrorCallback.value.invoke(Throwable())

        scope.testScheduler.advanceUntilIdle()

        // Verify Dispatch
        val languageSettingsCallback = argumentCaptor<((Map<String, LanguageSetting>) -> Unit)>()
        verify(engine, atLeastOnce()).getLanguageSettings(
            onSuccess = languageSettingsCallback.capture(),
            onError = any(),
        )
        val mockLanguageSetting = mapOf("en" to LanguageSetting.OFFER)
        languageSettingsCallback.value.invoke(mockLanguageSetting)
    }

    @Test
    fun `WHEN ManageLanguageModelsAction is dispatched and is successful THEN SetLanguageModelsAction is dispatched with the new state`() = runTest {
        setupMockState()
        // Send Action
        val options = ModelManagementOptions(languageToManage = "es", operation = ModelOperation.DOWNLOAD, operationLevel = OperationLevel.LANGUAGE)
        val action =
            TranslationsAction.ManageLanguageModelsAction(
                options,
            )
        translationsMiddleware.invoke(context, {}, action)

        scope.testScheduler.advanceUntilIdle()

        // Mock success from engine
        val updateModelsErrorCallback = argumentCaptor<(() -> Unit)>()
        verify(engine).manageTranslationsLanguageModel(
            options = any(),
            onSuccess = updateModelsErrorCallback.capture(),
            onError = any(),
        )
        updateModelsErrorCallback.value.invoke()

        scope.testScheduler.advanceUntilIdle()

        // Should set the latest state
        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.SetLanguageModelsAction(
                languageModels = mockLanguageModels,
            ),
        )
    }

    @Test
    fun `WHEN ManageLanguageModelsAction is dispatched and fails THEN SetLanguageModelsAction is dispatched and an error is dispatched`() = runTest {
        setupMockState()
        // Send Action
        val options = ModelManagementOptions(
            languageToManage = "es",
            operation = ModelOperation.DELETE,
            operationLevel = OperationLevel.LANGUAGE,
        )
        val action =
            TranslationsAction.ManageLanguageModelsAction(
                options,
            )
        translationsMiddleware.invoke(context, {}, action)

        scope.testScheduler.advanceUntilIdle()

        // Mock failure from engine
        val updateModelsErrorCallback = argumentCaptor<((Throwable) -> Unit)>()
        verify(engine).manageTranslationsLanguageModel(
            options = any(),
            onSuccess = any(),
            onError = updateModelsErrorCallback.capture(),
        )
        updateModelsErrorCallback.value.invoke(Throwable())

        // Verify expected error state set
        val responseLanguageModels = mutableListOf(
            LanguageModel(language = mockLanguage, status = ModelState.ERROR_DELETION, size = mockSize),
        )
        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.SetLanguageModelsAction(
                languageModels = responseLanguageModels,
            ),
        )

        // Should report an error
        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.EngineExceptionAction(
                error = TranslationError.LanguageModelUpdateError(any()),
            ),
        )
    }

    @Test
    fun `WHEN UpdateLocaleAction is dispatched THEN SetLanguageSettingsAction AND SetLanguageModelsAction are also dispatched`() = runTest {
        // Send Action
        translationsMiddleware.invoke(context = context, next = {}, action = LocaleAction.UpdateLocaleAction(locale = Locale.forLanguageTag("es")))
        scope.testScheduler.advanceUntilIdle()

        // Mock responses
        val languageCallback = argumentCaptor<((TranslationSupport) -> Unit)>()
        verify(engine, atLeastOnce()).getSupportedTranslationLanguages(onSuccess = languageCallback.capture(), onError = any())
        val supportedLanguages = TranslationSupport(
            fromLanguages = listOf(Language("en", "English")),
            toLanguages = listOf(Language("en", "English")),
        )
        languageCallback.value.invoke(supportedLanguages)

        val modelCallback = argumentCaptor<((List<LanguageModel>) -> Unit)>()
        verify(engine, atLeastOnce()).getTranslationsModelDownloadStates(onSuccess = modelCallback.capture(), onError = any())
        modelCallback.value.invoke(mockLanguageModels)

        scope.testScheduler.advanceUntilIdle()

        // Check expectations
        // Verifying at least once due to this also occurring at initialization
        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.SetSupportedLanguagesAction(
                supportedLanguages = supportedLanguages,
            ),
        )
        verify(store, atLeastOnce()).dispatch(
            TranslationsAction.SetLanguageModelsAction(
                languageModels = mockLanguageModels,
            ),
        )
    }
}
