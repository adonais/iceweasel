/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.helpers

/**
 * Where navigation last believes it arrived.
 *
 * A breadcrumb rather than a source of truth: whether a page is actually on screen is answered by selector verification
 * (mozIsOnPageNow / mozWaitForPageToLoad), and this only records what the navigation layer thinks it achieved.
 *
 * It has a second reader now, which raises the cost of a stale value. ScreenDump writes it into every failure dump as
 * `harnessPage`, and mission-control shows it next to the page its analyser infers from the elements on screen; when
 * the two disagree, navigation recorded an arrival it did not make, and that disagreement is the finding. A tracker
 * left pointing at the wrong page turns that from a signal into a false accusation.
 *
 * Still a mutable global, because every page object writes it and threading it through would be boilerplate on all of
 * them. What it has now is an owner: BaseTest resets it through [reset] at the start of each test, and [ENTRY] names
 * the value that means "nowhere yet" instead of leaving a bare string to be repeated at each site.
 */
object PageStateTracker {

    /** Before any navigation has happened. */
    const val ENTRY = "AppEntry"

    @Volatile var currentPageName: String = ENTRY

    /** Back to "nowhere yet". Called per test, so one test's last page is not the next test's first. */
    fun reset() {
        currentPageName = ENTRY
    }
}
