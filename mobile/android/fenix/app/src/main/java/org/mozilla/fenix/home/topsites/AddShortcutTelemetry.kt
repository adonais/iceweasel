/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.home.topsites

/**
 * The interaction source of how the shortcut was added. Recorded in the `top_sites.add` telemetry event.
 *
 * @property value The value reported in the `source` event extras.
 */
enum class AddShortcutSource(val value: String) {
    /** The shortcut was added from a user selection in the popular sites list. */
    POPULAR("popular"),

    /** The shortcut was manually added by the user. */
    MANUAL("manual"),

    /** A frecent top site was promoted to a pinned shortcut. */
    FRECENCY_PROMOTE("frecency_promote"),
}

/**
 * The entry point from where the add flow was started from. Recorded in the `top_sites.add` and
 * `top_sites.add_sheet_shown` telemetry events.
 *
 * @property value The value reported in the `entry_point` event extras.
 */
enum class AddShortcutEntryPoint(val value: String) {
    /** The flow was started from the homepage. */
    HOMEPAGE("homepage"),

    /** The flow was started from the page menu. */
    PAGE_MENU("page_menu"),

    /** The flow was started from the shortcuts library screen. */
    SHORTCUTS_LIBRARY("shortcuts_library"),
}
