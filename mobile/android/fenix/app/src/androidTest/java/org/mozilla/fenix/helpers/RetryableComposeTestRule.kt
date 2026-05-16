/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.helpers

import android.app.Activity
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.IdlingResource
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import kotlinx.coroutines.test.TestScope
import org.junit.rules.TestRule
import org.junit.runner.Description
import org.junit.runners.model.Statement
import org.mozilla.fenix.helpers.Constants.TAG

/**
 * A [TestRule] wrapper for [AndroidComposeTestRule] that supports test retries.
 *
 * Traditional Compose rules cannot be reused across multiple [Statement.evaluate] calls
 * because their internal [TestScope] and [IdlingResource] transitions to a terminal
 * state upon completion or failure.
 *
 * This rule acts as a factory, using the provided [composeRuleFactory] to instantiate
 * a fresh [AndroidComposeTestRule] and a new [Activity] for every retry attempt
 * triggered by an outer [RetryTestRule].
 *
 * @param composeRuleFactory A lambda that constructs the specific Compose rule configuration.
 */
class RetryableComposeTestRule<T : ComponentActivity, R : TestRule>(
    private val composeRuleFactory: () -> ComposeContentTestRule,
) : TestRule {

    private var _innerRule: ComposeContentTestRule? = null

    /**
     * Provides access to the current instance of the compose rule.
     * Use this inside your test methods: composeTestRule.onNodeWithText(...)
     */
    @Suppress("UNCHECKED_CAST")
    val current: AndroidComposeTestRule<R, T>
        get() {
            Log.i(TAG, "RetryableComposeTestRule: Accessing current compose rule.")
            return (_innerRule ?: error("Compose rule was not initialized by the RetryRule!")) as AndroidComposeTestRule<R, T>
        }

    override fun apply(base: Statement, description: Description): Statement {
        return object : Statement() {
            override fun evaluate() {
                Log.i(TAG, "RetryableComposeTestRule: Creating new compose rule for ${description.className}.${description.methodName}")
                _innerRule = composeRuleFactory()
                try {
                    Log.i(TAG, "RetryableComposeTestRule: Applying inner compose rule.")
                    // Apply the new AndroidComposeTestRule to the base statement
                    _innerRule!!.apply(base, description).evaluate()
                    Log.i(TAG, "RetryableComposeTestRule: Test execution finished successfully.")
                } finally {
                    Log.i(TAG, "RetryableComposeTestRule: Clearing compose rule instance.")
                    _innerRule = null
                }
            }
        }
    }
}
