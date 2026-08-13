/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.summarization

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import mozilla.components.browser.state.state.TabSessionState
import mozilla.components.concept.engine.EngineSession
import mozilla.components.concept.engine.pageextraction.ContentParams
import mozilla.components.concept.llm.CloudLlmProvider
import mozilla.components.concept.llm.LlmProvider
import mozilla.components.feature.summarize.ErrorReporter
import mozilla.components.feature.summarize.SummarizationMiddleware
import mozilla.components.feature.summarize.SummarizationState
import mozilla.components.feature.summarize.SummarizationStore
import mozilla.components.feature.summarize.content.ContentProvider
import mozilla.components.feature.summarize.content.PageContentExtractor
import mozilla.components.feature.summarize.content.PageMetadata
import mozilla.components.feature.summarize.content.PageMetadataExtractor
import mozilla.components.feature.summarize.settings.SummarizationSettings
import mozilla.components.feature.summarize.summarizationReducer
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * A [ViewModel] that owns and survives configuration changes for a [SummarizationStore].
 *
 * @param currentTab The [TabSessionState] whose page is being summarized.
 * @param initializedFromShake Whether the summarization feature was triggered by a shake gesture.
 * @param pageTitle The title of the page being summarized.
 * @param connectionType the current network [ConnectionType].
 * @param llmProvider the [LlmProvider] used to summarize the page.
 * @param settings the SummarizationSettings.
 * @param errorReporter reports caught exceptions to the crash reporting service.
 */
@Suppress("LongParameterList")
class SummarizationStoreViewModel(
    currentTab: TabSessionState?,
    initializedFromShake: Boolean,
    pageTitle: String,
    connectionType: ConnectionType,
    llmProvider: CloudLlmProvider,
    settings: SummarizationSettings,
    errorReporter: ErrorReporter,
) : ViewModel() {
    private val engineSession = currentTab?.engineState?.engineSession

    val store = SummarizationStore(
        initialState = SummarizationState.Inert(initializedFromShake),
        reducer = ::summarizationReducer,
        middleware = listOf(
            SummarizationTelemetryMiddleware(connectionType),
            SummarizationMiddleware(
                isPageLoadingFlow = currentTab.asPageLoadingFlow(),
                settings = settings,
                llmProvider = llmProvider,
                contentProvider = ContentProvider.fromPage(
                    pageTitle = pageTitle,
                    pageContentExtractor = engineSession.asPageContentExtractor(),
                    pageMetadataExtractor = engineSession.asPageMetadataExtractor(),
                ),
                errorReporter = errorReporter,
                scope = viewModelScope,
            ),
        ),
    )

    companion object {
        /**
         * Creates a [ViewModelProvider.Factory] for [SummarizationStoreViewModel].
         *
         * @param currentTab The [TabSessionState] whose page is being summarized.
         * @param initializedFromShake Whether the summarization feature was triggered by a shake gesture.
         * @param pageTitle The title of the page being summarized.
         * @param connectionType the current network [ConnectionType].
         * @param llmProvider the [LlmProvider] used to summarize the page.
         * @param settings the SummarizationSettings.
         * @param errorReporter reports caught exceptions to the crash reporting service.
         */
        fun factory(
            currentTab: TabSessionState?,
            initializedFromShake: Boolean,
            pageTitle: String,
            connectionType: ConnectionType,
            llmProvider: CloudLlmProvider,
            settings: SummarizationSettings,
            errorReporter: ErrorReporter,
        ) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return SummarizationStoreViewModel(
                    currentTab = currentTab,
                    initializedFromShake = initializedFromShake,
                    pageTitle = pageTitle,
                    llmProvider = llmProvider,
                    connectionType = connectionType,
                    settings = settings,
                    errorReporter = errorReporter,
                ) as T
            }
        }
    }
}

/**
 * Gets the content for a given engine session.
 */
private fun EngineSession?.asPageContentExtractor(): PageContentExtractor = { options ->
    runCatching {
        val params = ContentParams(removeBoilerplate = options.shouldUseReaderModeContent)
        suspendCancellableCoroutine { continuation ->
            this!!.getPageContent(
                options = params,
                onResult = { content ->
                    continuation.resume(content)
                },
                onException = { error ->
                    continuation.resumeWithException(error)
                },
            )
        }
    }
}

private fun EngineSession?.asPageMetadataExtractor(): PageMetadataExtractor = {
    runCatching {
        suspendCancellableCoroutine { continuation ->
            this!!.getPageMetadata(
                onResult = { metadata ->
                    continuation.resume(
                        PageMetadata(
                            structuredDataTypes = metadata.structuredDataTypes,
                            wordCount = metadata.wordCount,
                            language = metadata.language,
                            isReaderable = metadata.isReaderable,
                        ),
                    )
                },
                onException = { error ->
                    continuation.resumeWithException(error)
                },
            )
        }
    }
}

/**
 * Emits the page loading state for this tab, starting with its current value and then observing
 * subsequent changes from the underlying [EngineSession].
 */
private fun TabSessionState?.asPageLoadingFlow(): Flow<Boolean> = callbackFlow {
    val engineSession = this@asPageLoadingFlow?.engineState?.engineSession
    trySend(this@asPageLoadingFlow?.content?.isLoading == true)

    val observer = object : EngineSession.Observer {
        override fun onLoadingStateChange(loading: Boolean) {
            trySend(loading)
        }
    }
    engineSession?.register(observer)
    awaitClose { engineSession?.unregister(observer) }
}
