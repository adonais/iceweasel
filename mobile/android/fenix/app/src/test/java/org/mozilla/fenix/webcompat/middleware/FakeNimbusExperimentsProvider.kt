/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.webcompat.middleware

import org.mozilla.experiments.nimbus.internal.EnrolledExperiment

class FakeNimbusExperimentsProvider(
    override val activeExperiments: List<EnrolledExperiment> = emptyList(),
    private val experimentBranchLambda: (String) -> String? = { null },
) : NimbusExperimentsProvider {
    override fun getExperimentBranch(experimentId: String): String? = experimentBranchLambda(experimentId)
}
