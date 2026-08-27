/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.summarize.ext

import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.mapNotNull
import mozilla.components.concept.llm.AuthenticationRequired
import mozilla.components.concept.llm.CloudLlmProvider
import mozilla.components.feature.summarize.LlmProviderAction
import mozilla.components.feature.summarize.SummarizationFailed
import mozilla.components.feature.summarize.SummarizationRequested

internal val CloudLlmProvider.fetchLlm get() = flow {
    // Only announce loading once preparation has resolved to a usable provider, so a sign-in
    // prompt or error is shown directly instead of flashing a loading state first.
    if (state.value is CloudLlmProvider.State.Ready) {
        emit(SummarizationRequested(info))
    }
    emitAll(state.mapNotNull { it.action })
}

internal val CloudLlmProvider.State.action get() = when (this) {
    CloudLlmProvider.State.Available -> null
    is CloudLlmProvider.State.Ready -> LlmProviderAction.ProviderInitialized(llm)
    is CloudLlmProvider.State.Unavailable -> if (exception is AuthenticationRequired) {
        LlmProviderAction.SignInRequired(exception)
    } else {
        SummarizationFailed(exception)
    }
}
