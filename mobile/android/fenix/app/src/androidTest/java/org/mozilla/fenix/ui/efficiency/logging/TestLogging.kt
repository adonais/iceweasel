/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.logging

/**
 * Where the harness finds the reporter.
 *
 * A global rather than a constructor argument: nearly every helper call flows through BasePage or BaseTest, and
 * threading a reporter through every page-object constructor is boilerplate that buys nothing. Not pure DI, but this is
 * instrumentation-test code, and the alternative is friction on every page object anyone writes.
 *
 * Never null. BaseTest installs a real reporter in setUp; before that - and in tooling that drives page objects outside
 * a test, like the inspector - it is [TimedReporter.Silent]. A nullable field put a `?.` on all forty-odd call sites to
 * express something no caller ever wanted to handle.
 */
object TestLogging {
    @Volatile var reporter: TimedReporter = TimedReporter.Silent

    /**
     * The reporter, installing a real one first if nothing has yet.
     *
     * `reporter` is Silent until BaseTest's @Before runs, and a JUnit TestWatcher's `starting()` fires BEFORE @Before
     * --- so anything recorded from there went to Silent and was dropped. It only bit the FIRST test of each class,
     * because the reporter installed for one test is still installed for the next, which made it look like an
     * occasional gap rather than a rule. Every caller that can run outside a test body should come through here.
     */
    fun installed(): TimedReporter {
        if (reporter === TimedReporter.Silent) {
            reporter = LoggingBridge.createReporter()
        }
        return reporter
    }
}
