/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.ui.efficiency.core

import androidx.compose.ui.test.SemanticsNodeInteractionCollection
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.matcher.ViewMatchers.isRoot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.logging.StepDescriptor
import org.mozilla.fenix.ui.efficiency.logging.StepLogger
import org.mozilla.fenix.ui.efficiency.logging.StepResult
import org.mozilla.fenix.ui.efficiency.logging.TestStatus
import org.mozilla.fenix.ui.efficiency.logging.TimedReporter

class VerbContractTest {
    private val selector =
        Selector(
            strategy = org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy.COMPOSE_BY_TAG,
            value = "target",
            description = "target",
        )

    @Test
    fun anEmptySelectorGroupCannotSucceedVacuously() {
        val logger = RecordingStepLogger()
        val host = FakeVerbHost(TimedReporter(logger))

        val present = host.groupPresent(verb = "verify_group", label = "Page_GROUP", selectors = emptyList())

        assertFalse(present)
        assertEquals(0, host.locateCalls)
        assertEquals(Failure.EMPTY_SELECTOR_GROUP, logger.completed.single().args["failure"])
    }

    @Test
    fun selectorGroupReportsEveryMissingSelector() {
        val logger = RecordingStepLogger()
        val host = FakeVerbHost(TimedReporter(logger), ElementResolution.Absent)
        val second = selector.copy(value = "second", description = "second")

        val present =
            host.groupPresent(verb = "verify_group", label = "Page_GROUP", selectors = listOf(selector, second))

        assertFalse(present)
        assertEquals(2, host.locateCalls)
    }

    @Test
    fun optionalSkipsOnlyTrueAbsence() {
        val logger = RecordingStepLogger()
        val host = FakeVerbHost(TimedReporter(logger), ElementResolution.Absent)

        host.require(verb = "click_if_present", selector = selector, optional = true)

        assertEquals("SKIP", logger.completed.last().args["outcome"])
        assertEquals(Failure.NOT_FOUND, logger.completed.last().args["failure"])
        assertEquals("assertion", logger.completed.last().args["failureCategory"])
        assertEquals("COMPOSE", logger.completed.last().args["backend"])
        assertEquals("MERGED", logger.completed.last().args["tree"])
        assertEquals(1, logger.completed.last().args["attempts"])
        assertEquals(0L, logger.completed.last().args["timeoutMs"])
        assertEquals("absent", logger.completed.last().args["lastObservation"])
    }

    @Test
    fun optionalDoesNotHideResolutionErrors() {
        val logger = RecordingStepLogger()
        val error = IllegalStateException("resolver broke")
        val host = FakeVerbHost(TimedReporter(logger), ElementResolution.Error(error))

        val thrown = runCatching {
            host.require(verb = "click_if_present", selector = selector, optional = true)
        }
            .exceptionOrNull()

        assertSame(error, thrown)
        assertEquals(Failure.RESOLUTION_ERROR, logger.completed.last().args["failure"])
        assertEquals(1, host.locateCalls)
    }

    @Test
    fun transientComposeResolutionErrorsRecoverAfterDismissingAnOverlay() {
        val logger = RecordingStepLogger()
        val transient = IllegalStateException("No compose hierarchies found in the app")
        val host =
            FakeVerbHost(
                TimedReporter(logger),
                ElementResolution.Error(transient),
                ElementResolution.Found(EspressoUiElement(onView(isRoot()))),
                dismissesOverlay = true,
            )

        host.require(verb = "verify", selector = selector)

        assertEquals(2, host.locateCalls)
        assertEquals(1, host.dismissOverlayCalls)
        assertEquals("OK", logger.completed.last().args["outcome"])
    }

    @Test
    fun optionalDoesNotHideActionErrors() {
        val logger = RecordingStepLogger()
        val error = IllegalStateException("action broke")
        val host =
            FakeVerbHost(
                TimedReporter(logger),
                ElementResolution.Found(EspressoUiElement(onView(isRoot()))),
                ElementResolution.Unsupported("recheck unavailable"),
            )

        val thrown = runCatching {
            host.require(verb = "click_if_present", selector = selector, optional = true) { throw error }
        }
            .exceptionOrNull()

        assertSame(error, thrown)
        assertEquals(Failure.ACTION_FAILED, logger.completed.last().args["failure"])
        assertTrue(logger.completed.any { it.args["resolution"] == "found" })
    }

    @Test
    fun optionalSkipsActionFailureOnlyAfterTargetDisappears() {
        val logger = RecordingStepLogger()
        val error = IllegalStateException("action raced removal")
        val host =
            FakeVerbHost(
                TimedReporter(logger),
                ElementResolution.Found(EspressoUiElement(onView(isRoot()))),
                ElementResolution.Absent,
            )

        host.require(verb = "click_if_present", selector = selector, optional = true) { throw error }

        assertEquals(2, host.locateCalls)
        assertEquals("SKIP", logger.completed.last().args["outcome"])
        assertEquals(Failure.DISAPPEARED_DURING_ACTION, logger.completed.last().args["failure"])
    }

    @Test
    fun pollingUsesFreshProbesAndReportsTheSatisfiedAttempt() {
        val runtime = FakeWaitRuntime()
        val observations = ArrayDeque(listOf(false, false, true))

        val outcome =
            waitFor(
                policy = WaitPolicy.Poll(timeout = 100, interval = 50),
                runtime = runtime,
                probe = { observations.removeFirst() },
                satisfied = { it },
            )

        assertTrue(outcome.satisfied)
        assertEquals(3, outcome.attempts)
        assertEquals(75L, outcome.elapsedMs)
        assertEquals(listOf(25L, 50L), runtime.sleeps)
    }

    @Test
    fun pollingStopsAtTheDeadlineWithTheLastObservation() {
        val runtime = FakeWaitRuntime()

        val outcome =
            waitFor(
                policy = WaitPolicy.Poll(timeout = 60, interval = 50),
                runtime = runtime,
                probe = { "not-ready" },
                satisfied = { it == "ready" },
            )

        assertFalse(outcome.satisfied)
        assertTrue(outcome.timedOut)
        assertEquals("not-ready", outcome.lastObservation)
        assertEquals(3, outcome.attempts)
        assertEquals(60L, outcome.elapsedMs)
        assertEquals(listOf(25L, 35L), runtime.sleeps)
    }

    @Test
    fun terminalObservationsDoNotRetry() {
        val runtime = FakeWaitRuntime()

        val outcome =
            waitFor(
                policy = WaitPolicy.Poll(timeout = 100, interval = 50),
                runtime = runtime,
                probe = { "unsupported" },
                satisfied = { false },
                terminal = { it == "unsupported" },
            )

        assertTrue(outcome.terminal)
        assertFalse(outcome.timedOut)
        assertEquals(1, outcome.attempts)
        assertTrue(runtime.sleeps.isEmpty())
    }

    private class FakeWaitRuntime : WaitRuntime {
        var now = 0L
        val sleeps = mutableListOf<Long>()

        override fun nowMillis() = now

        override fun sleep(millis: Long) {
            sleeps += millis
            now += millis
        }
    }

    private class FakeVerbHost(
        private val timedReporter: TimedReporter,
        private val resolution: ElementResolution = ElementResolution.Absent,
        private val subsequentResolution: ElementResolution = resolution,
        private val dismissesOverlay: Boolean = false,
    ) : VerbHost {
        var locateCalls = 0
        var dismissOverlayCalls = 0

        override fun reporter() = timedReporter

        override fun locate(selector: Selector, applyPreconditions: Boolean): ElementResolution {
            locateCalls += 1
            return if (locateCalls == 1) resolution else subsequentResolution
        }

        override fun locateAll(selector: Selector): SemanticsNodeInteractionCollection? = null

        override fun dismissOverlays(): Boolean {
            dismissOverlayCalls += 1
            return dismissesOverlay
        }

        override fun dumpFailure(label: String) = Unit

        override fun stepId(prefix: String, description: String) = "$prefix-$description"
    }

    private class RecordingStepLogger : StepLogger {
        val completed = mutableListOf<StepDescriptor>()

        override fun testStart(testId: String, meta: Map<String, Any?>) = Unit

        override fun testEnd(testId: String, status: TestStatus) = Unit

        override fun stepStart(step: StepDescriptor) = Unit

        override fun stepEnd(step: StepDescriptor, result: StepResult) {
            completed += step
        }

        override fun record(type: String, fields: Map<String, Any?>) = Unit
    }
}
