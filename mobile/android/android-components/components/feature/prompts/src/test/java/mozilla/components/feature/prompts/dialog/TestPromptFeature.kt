package mozilla.components.feature.prompts.dialog

import mozilla.components.concept.storage.CreditCardValidationDelegate
import mozilla.components.concept.storage.LoginValidationDelegate
import mozilla.components.feature.prompts.login.LoginExceptions

/**
 * Test prompt feature that allows testers to override the specific functionality they like
 */
internal class TestPromptFeature : Prompter {
    override val creditCardValidationDelegate: CreditCardValidationDelegate?
        get() = null
    override val loginValidationDelegate: LoginValidationDelegate?
        get() = null
    override val loginExceptionStorage: LoginExceptions?
        get() = null

    var confirmedPrompt: TestPrompt? = null
        private set
    var canceledPrompt: TestPrompt? = null
        private set

    override fun onCancel(
        sessionId: String,
        promptRequestUID: String,
        value: Any?,
    ) {
        canceledPrompt = TestPrompt(sessionId, promptRequestUID, value)
    }

    override fun onConfirm(
        sessionId: String,
        promptRequestUID: String,
        value: Any?,
    ) {
        confirmedPrompt = TestPrompt(sessionId, promptRequestUID, value)
    }

    override fun onClear(sessionId: String, promptRequestUID: String) = Unit

    override fun onOpenLink(url: String) = Unit
}

data class TestPrompt(
    val sessionId: String,
    val promptRequestUid: String,
    val value: Any?,
)
