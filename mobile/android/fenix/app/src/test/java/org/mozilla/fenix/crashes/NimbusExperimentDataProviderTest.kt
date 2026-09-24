/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.crashes

import androidx.test.ext.junit.runners.AndroidJUnit4
import mozilla.components.lib.crash.runtimetagproviders.ExperimentData
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.experiments.nimbus.internal.EnrollmentSlugs

@RunWith(AndroidJUnit4::class)
class NimbusExperimentDataProviderTest {

    @Test
    fun `GIVEN active experiments, then the experiments are converted to runtime tags map`() {
        // given the active experiments
        fun getEnrollments() =
            listOf(
                EnrollmentSlugs(slug = "experiment-01", branchSlug = "control"),
                EnrollmentSlugs(slug = "experiment-02", branchSlug = "treatment"),
                EnrollmentSlugs(slug = "experiment-03", branchSlug = "variant-1"),
            )

        val runtimeTagProvider = NimbusExperimentDataProvider(::getEnrollments)

        val data = runtimeTagProvider.getExperimentData()
        val expected =
            ExperimentData(
                mapOf(
                    "experiment-01" to "control",
                    "experiment-02" to "treatment",
                    "experiment-03" to "variant-1",
                )
            )

        assertEquals(
            "Runtime tags should contain all active experiments",
            expected,
            data,
        )
    }
}
