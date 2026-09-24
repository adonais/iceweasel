/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.browser.thumbnails.facts

import mozilla.components.support.base.Component
import mozilla.components.support.base.facts.Action
import mozilla.components.support.base.facts.Fact
import mozilla.components.support.base.facts.collect

/** Facts emitted for telemetry related to [BrowserThumbnails]. */
class BrowserThumbnailsFacts {
    /** Items that specify which thumbnail-capture event occurred. */
    object Items {
        const val CAPTURE_ATTEMPTED = "capture_attempted"
        const val CAPTURE_RESULT = "capture_result"
        const val CAPTURE_DURATION = "capture_duration"
        const val DISK_WRITE_DURATION = "disk_write_duration"
    }

    /** Keys for values passed through [Fact.metadata]. */
    object MetadataKeys {
        /**
         * Duration of an [Items.CAPTURE_DURATION] or [Items.DISK_WRITE_DURATION] event, as a `Long` in milliseconds.
         */
        const val DURATION_MS = "duration_ms"
    }

    /** Values passed as the [Fact.value] for [Items.CAPTURE_ATTEMPTED] to identify the trigger. */
    object CaptureAttemptedTriggers {
        /** A load transition observed from the browser store flow. */
        const val LOAD_COMPLETED = "load_completed"

        /** The user tapped the tab counter to open the tabs tray. */
        const val TAB_COUNTER_CLICK = "tab_counter_click"

        /** The user started a horizontal toolbar swipe to switch tabs. */
        const val SWIPE_TO_SWITCH_TABS = "swipe_to_switch_tabs"

        /** Any other consumer calling `requestScreenshot()` directly. */
        const val EXTERNAL_REQUEST = "external_request"
    }

    /** Values passed as the [Fact.value] for [Items.CAPTURE_RESULT] to identify the outcome. */
    object CaptureResults {
        /** The engine returned a bitmap and the store was updated. */
        const val SUCCEEDED = "succeeded"

        /** The engine returned no bitmap (typically the compositor detach race). */
        const val NULL_BITMAP = "null_bitmap"

        /** The `isLowOnMemory()` gate skipped the request before it reached the engine. */
        const val LOW_MEMORY = "low_memory"
    }
}

internal fun emitBrowserThumbnailsFact(
    action: Action,
    item: String,
    value: String? = null,
    metadata: Map<String, Any>? = null,
) {
    Fact(
            Component.BROWSER_THUMBNAILS,
            action,
            item,
            value,
            metadata,
        )
        .collect()
}
