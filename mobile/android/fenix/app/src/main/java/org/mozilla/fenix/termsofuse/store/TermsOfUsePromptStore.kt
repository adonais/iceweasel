/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse.store

import mozilla.components.lib.state.Action
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.State
import mozilla.components.lib.state.Store

/**
 * [State] for the terms of use prompt
 */
data object TermsOfUsePromptState : State

/**
 * [Action] related to [TermsOfUsePromptStore]
 */
sealed interface TermsOfUsePromptAction : Action {
    /**
     * Triggered when the user clicks accept
     */
    data object OnAcceptClicked : TermsOfUsePromptAction

    /**
     * Triggered when the user clicks not now
     */
    data object OnNotNowClicked : TermsOfUsePromptAction

    /**
     * Triggered when the user closes the prompt by swiping, hitting back, or tapping the
     * background scrim
     */
    data object OnPromptManuallyDismissed : TermsOfUsePromptAction

    /**
     * Triggered when the prompt is dismissed for any reason.
     */
    data object OnPromptDismissed : TermsOfUsePromptAction
}

/**
 * A [Store] that holds the [TermsOfUsePromptState]
 */
class TermsOfUsePromptStore(
    middleware: List<Middleware<TermsOfUsePromptState, TermsOfUsePromptAction>>,
) : Store<TermsOfUsePromptState, TermsOfUsePromptAction>(
    initialState = TermsOfUsePromptState,
    reducer = { _, _ -> TermsOfUsePromptState },
    middleware = middleware,
)
