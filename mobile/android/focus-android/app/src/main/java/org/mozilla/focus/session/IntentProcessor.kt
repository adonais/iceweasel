/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.focus.session

import android.content.Context
import android.content.Intent
import android.os.Bundle
import mozilla.components.browser.state.state.SessionState
import mozilla.components.concept.engine.EngineSession.LoadUrlFlags
import mozilla.components.feature.customtabs.CustomTabIntentProcessor
import mozilla.components.feature.intent.ext.getSessionId
import mozilla.components.feature.intent.processing.IntentProcessor as ComponentsIntentProcessor
import mozilla.components.feature.intent.processing.TabIntentProcessor
import mozilla.components.feature.search.SearchUseCases
import mozilla.components.feature.tabs.CustomTabsUseCases
import mozilla.components.feature.tabs.TabsUseCases
import mozilla.components.support.utils.SafeIntent
import org.mozilla.focus.activity.TextActionActivity
import org.mozilla.focus.ext.components
import org.mozilla.focus.shortcut.HomeScreen

/**
 * Focus-specific [mozilla.components.feature.intent.processing.IntentProcessor] implementation. It uses
 * [TabIntentProcessor] and [CustomTabIntentProcessor] internally to handle standard intents and adds Focus-specific
 * logic for home screen shortcuts and text selection.
 *
 * @param context The application context.
 * @param tabsUseCases Use cases for managing browser tabs.
 * @param customTabsUseCases Use cases for managing custom tabs.
 * @param searchUseCases Use cases for performing searches.
 */
class IntentProcessor(
    private val context: Context,
    private val tabsUseCases: TabsUseCases,
    customTabsUseCases: CustomTabsUseCases,
    searchUseCases: SearchUseCases,
) : ComponentsIntentProcessor {

    private val tabIntentProcessor =
        TabIntentProcessor(
            tabsUseCases,
            searchUseCases.newTabSearch,
            isPrivate = true,
        )

    private val customTabIntentProcessor =
        CustomTabIntentProcessor(
            customTabsUseCases.add,
            context.resources,
            isPrivate = true,
        )

    /** Represents the result of processing an intent. */
    sealed class Result {
        /** No action was taken. */
        object None : Result()

        /** A new standard tab was created. */
        object Tab : Result()

        /** A new custom tab was created. */
        data class CustomTab(val id: String) : Result()
    }

    /**
     * Handle this incoming intent (via onCreate()) and create a new session if required.
     *
     * @param intent The incoming [SafeIntent] to process.
     * @param savedInstanceState The saved instance state bundle, or `null` if there is none.
     * @return A [Result] indicating whether a new tab, custom tab, or no session was created.
     */
    fun handleIntent(intent: SafeIntent, savedInstanceState: Bundle?): Result {
        if ((intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) {
            // This Intent was launched from history (recent apps). Android will redeliver the
            // original Intent (which might be a VIEW intent). However, if there's no active browsing
            // session then we do not want to re-process the Intent and potentially re-open a website
            // from a session that the user already "erased".
            return Result.None
        }

        if (savedInstanceState != null) {
            // We are restoring a previous session - No need to handle this Intent.
            return Result.None
        }

        return processForResult(intent.unsafe)
    }

    private fun processForResult(intent: Intent): Result {
        val safeIntent = SafeIntent(intent)

        return when {
            safeIntent.hasExtra(HomeScreen.ADD_TO_HOMESCREEN_TAG) -> {
                val requestDesktop = safeIntent.getBooleanExtra(HomeScreen.REQUEST_DESKTOP, false)
                val tabId =
                    tabsUseCases.addTab(
                        safeIntent.dataString ?: "",
                        source = SessionState.Source.Internal.HomeScreen,
                        private = true,
                        flags = LoadUrlFlags.external(),
                    )
                if (requestDesktop) {
                    context.components.sessionUseCases.requestDesktopSite(true, tabId)
                }
                Result.Tab
            }

            safeIntent.hasExtra(TextActionActivity.EXTRA_TEXT_SELECTION) -> {
                tabsUseCases.addTab(
                    safeIntent.dataString ?: "",
                    source = SessionState.Source.Internal.TextSelection,
                    private = true,
                    flags = LoadUrlFlags.external(),
                )
                Result.Tab
            }

            customTabIntentProcessor.process(intent) -> {
                Result.CustomTab(intent.getSessionId()!!)
            }

            tabIntentProcessor.process(intent) -> {
                Result.Tab
            }

            else -> Result.None
        }
    }

    /**
     * Handle this incoming intent (via onNewIntent()) and create a new session if required.
     *
     * @param intent The incoming [SafeIntent] to process.
     */
    fun handleNewIntent(intent: SafeIntent) {
        process(intent.unsafe)
    }

    /**
     * Processes the given [Intent] and opens the appropriate tab or custom tab.
     *
     * Handles three Focus-specific cases in order of priority:
     * 1. Intents from a home screen shortcut, optionally requesting desktop mode.
     * 2. Intents from text selection via [TextActionActivity].
     * 3. Custom tab intents, delegated to [CustomTabIntentProcessor].
     * 4. Standard tab intents, delegated to [TabIntentProcessor].
     *
     * @param intent The [Intent] to process.
     * @return `true` if the intent was handled, `false` otherwise.
     */
    override fun process(intent: Intent): Boolean = processForResult(intent) !is Result.None
}
