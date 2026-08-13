/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.components.metrics

import android.content.Context
import com.adjust.sdk.Adjust
import com.adjust.sdk.AdjustConfig
import com.adjust.sdk.AdjustEvent

/**
 * Thin seam around the Adjust SDK's static entry points so that [AdjustMetricsService] can be
 * unit-tested without mocking statics.
 */
interface AdjustSdkController {

    /**
     * Initializes the Adjust SDK with the given [config]. Must be called before any other method.
     */
    fun initSdk(config: AdjustConfig)

    /**
     * Enables the Adjust SDK so it starts tracking.
     */
    fun enable()

    /**
     * Tracks the given [event].
     */
    fun trackEvent(event: AdjustEvent)

    /**
     * Requests that Adjust erase the user's data for GDPR "forget me", using [context].
     */
    fun gdprForgetMe(context: Context)
}

/**
 * [AdjustSdkController] implementation that delegates to the Adjust SDK.
 */
class DefaultAdjustSdkController : AdjustSdkController {

    override fun initSdk(config: AdjustConfig) = Adjust.initSdk(config)

    override fun enable() = Adjust.enable()

    override fun trackEvent(event: AdjustEvent) = Adjust.trackEvent(event)

    override fun gdprForgetMe(context: Context) = Adjust.gdprForgetMe(context)
}
