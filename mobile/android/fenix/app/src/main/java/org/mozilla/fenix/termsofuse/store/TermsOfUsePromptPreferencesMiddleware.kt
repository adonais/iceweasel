/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.termsofuse.store

import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.MiddlewareContext

/**
 * [Middleware] that reacts to various [TermsOfUsePromptAction]s
 *
 * @param repository the repository for the terms of use prompt
 */
class TermsOfUsePromptPreferencesMiddleware(
    private val repository: TermsOfUsePromptRepository,
) : Middleware<TermsOfUsePromptState, TermsOfUsePromptAction> {
    override fun invoke(
        context: MiddlewareContext<TermsOfUsePromptState, TermsOfUsePromptAction>,
        next: (TermsOfUsePromptAction) -> Unit,
        action: TermsOfUsePromptAction,
    ) {
        when (action) {
            is TermsOfUsePromptAction.OnAcceptClicked -> {
                repository.updateHasAcceptedTermsOfUsePreference()
            }

            is TermsOfUsePromptAction.OnNotNowClicked -> {
                repository.updateHasPostponedAcceptingTermsOfUsePreference()
            }

            is TermsOfUsePromptAction.OnPromptManuallyDismissed -> {
                repository.updateHasPostponedAcceptingTermsOfUsePreference()
            }

            is TermsOfUsePromptAction.OnPromptDismissed -> {
                repository.updateLastTermsOfUsePromptTimeInMillis()
            }
        }

        next(action)
    }
}
