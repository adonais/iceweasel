/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.crashes

import mozilla.components.lib.crash.RuntimeTagProvider
import mozilla.components.lib.crash.runtimetagproviders.ExperimentData
import mozilla.components.lib.crash.runtimetagproviders.ExperimentDataProvider
import org.mozilla.experiments.nimbus.internal.EnrollmentSlugs

/**
 * [RuntimeTagProvider] that provides the active experiments and rollouts as runtime tags.
 *
 * @param getEnrollments A function that returns the active enrollments
 */
class NimbusExperimentDataProvider(private val getEnrollments: () -> List<EnrollmentSlugs>) : ExperimentDataProvider {

    override fun getExperimentData(): ExperimentData {
        val data =
            getEnrollments().associate {
                it.slug to it.branchSlug
            }

        return ExperimentData(data)
    }
}
