/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.engine.gecko.facts

import mozilla.components.support.base.Component
import mozilla.components.support.base.facts.Action
import mozilla.components.support.base.facts.Fact
import mozilla.components.support.base.facts.collect

/** Facts emitted for telemetry related to the GeckoEngineView. */
class GeckoEngineViewFacts {
    /** Items that specify which full-page screenshot event occurred. */
    object Items {
        const val CAPTURE_FULL_PAGE_ATTEMPTED = "capture_full_page_attempted"
        const val CAPTURE_FULL_PAGE_RESULT = "capture_full_page_result"
    }

    /** Values passed as the [Fact.value] for [Items.CAPTURE_FULL_PAGE_RESULT] to identify the outcome. */
    object CaptureFullPageResults {
        /** The engine returned a bitmap. */
        const val SUCCEEDED = "succeeded"

        /** The capture failed: the request was rejected or returned no bitmap. */
        const val FAILED = "failed"
    }
}

internal fun emitGeckoEngineViewFact(
    action: Action,
    item: String,
    value: String? = null,
    metadata: Map<String, Any>? = null,
) {
    Fact(
            Component.BROWSER_ENGINE_GECKO,
            action,
            item,
            value,
            metadata,
        )
        .collect()
}
