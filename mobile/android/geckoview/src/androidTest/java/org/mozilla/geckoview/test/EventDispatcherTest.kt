/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.geckoview.test

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.MediumTest
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.Assert.assertThrows
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.gecko.EventDispatcher
import org.mozilla.geckoview.TranslationsController.RuntimeTranslation
import org.mozilla.geckoview.TranslationsController.RuntimeTranslation.NEVER

@RunWith(AndroidJUnit4::class)
@MediumTest
class EventDispatcherTest : BaseSessionTest() {

    @Test
    fun noSuchListenerAvailable() {
        val exception =
            assertThrows(RuntimeException::class.java) {
                    sessionRule.waitForResult(EventDispatcher.getInstance().queryBundle("GeckoView:NoSuchEvent"))
                }
                .cause as EventDispatcher.QueryException

        assertThat(exception.message, equalTo("Failed on message type: GeckoView:NoSuchEvent"))
    }

    @Test
    fun failureWithinQuery() {
        sessionRule.setPrefsUntilTestEnd(
            mapOf(
                "browser.translations.enable" to true,
                "browser.translations.geckoview.enableAllTestMocks" to false,
            )
        )

        try {
            sessionRule.waitForResult(RuntimeTranslation.setLanguageSettings("xyz-not-a-language", NEVER))
            fail("Should not process a request with an invalid language tag.")
        } catch (e: RuntimeException) {
            val cause = e.cause as EventDispatcher.QueryException

            assertThat(
                cause.message,
                equalTo("Failed on message type: GeckoView:Translations:SetLanguageSettings"),
            )
        }
    }
}
