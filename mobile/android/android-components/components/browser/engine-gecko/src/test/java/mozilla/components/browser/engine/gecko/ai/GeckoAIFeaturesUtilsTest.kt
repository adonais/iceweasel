/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.engine.gecko.ai

import mozilla.components.browser.engine.gecko.ai.GeckoAIFeaturesUtils.intoAIFeaturesError
import mozilla.components.concept.engine.ai.AIFeaturesError
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.geckoview.AIFeaturesController.AIFeaturesException
import org.mozilla.geckoview.AIFeaturesController.AIFeaturesException.ERROR_COULD_NOT_PARSE
import org.mozilla.geckoview.AIFeaturesController.AIFeaturesException.ERROR_COULD_NOT_RESET
import org.mozilla.geckoview.AIFeaturesController.AIFeaturesException.ERROR_COULD_NOT_SET
import org.mozilla.geckoview.AIFeaturesController.AIFeaturesException.ERROR_UNKNOWN_FEATURE
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class GeckoAIFeaturesUtilsTest {

    @Test
    fun `intoAIFeaturesError maps AIFeaturesException correctly`() {
        val couldNotParseException =
            AIFeaturesException(ERROR_COULD_NOT_PARSE)
        val error1 = couldNotParseException.intoAIFeaturesError()
        assertTrue(error1 is AIFeaturesError.CouldNotParseError)
        assertEquals(couldNotParseException, error1.cause)

        val unknownFeatureException =
            AIFeaturesException(ERROR_UNKNOWN_FEATURE)
        val error2 = unknownFeatureException.intoAIFeaturesError()
        assertTrue(error2 is AIFeaturesError.UnknownFeatureError)
        assertEquals(unknownFeatureException, error2.cause)

        val couldNotSetException =
            AIFeaturesException(ERROR_COULD_NOT_SET)
        val error3 = couldNotSetException.intoAIFeaturesError()
        assertTrue(error3 is AIFeaturesError.CouldNotSetError)
        assertEquals(couldNotSetException, error3.cause)

        val couldNotResetException =
            AIFeaturesException(ERROR_COULD_NOT_RESET)
        val error4 = couldNotResetException.intoAIFeaturesError()
        assertTrue(error4 is AIFeaturesError.CouldNotResetError)
        assertEquals(couldNotResetException, error4.cause)

        val unknownCodeException = AIFeaturesException(999)
        val error5 = unknownCodeException.intoAIFeaturesError()
        assertTrue(error5 is AIFeaturesError.UnknownError)
        assertEquals(unknownCodeException, error5.cause)
    }

    @Test
    fun `intoAIFeaturesError maps generic exception to UnknownError`() {
        val genericException = RuntimeException("Some other error")

        val error = genericException.intoAIFeaturesError()

        assertTrue(error is AIFeaturesError.UnknownError)
        assertEquals(genericException, error.cause)
    }
}
