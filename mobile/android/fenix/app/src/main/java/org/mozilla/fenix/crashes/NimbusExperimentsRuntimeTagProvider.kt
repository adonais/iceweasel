/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.crashes

import mozilla.components.lib.crash.RuntimeTagProvider
import mozilla.components.service.nimbus.NimbusApi

/**
 * [RuntimeTagProvider] that provides the active [NimbusApi] experiments
 * as runtime tags.
 *
 * @param nimbusApi the [NimbusApi] to use to get the active experiments
 */
class NimbusExperimentsRuntimeTagProvider(
    private val nimbusApi: Lazy<NimbusApi>,
) : RuntimeTagProvider {

    override fun invoke(): Map<String, String> {
        val activeExperiments = nimbusApi.value.getActiveExperiments()
        return activeExperiments.associate { experiment ->
            experiment.slug to experiment.branchSlug
        }
    }
}
