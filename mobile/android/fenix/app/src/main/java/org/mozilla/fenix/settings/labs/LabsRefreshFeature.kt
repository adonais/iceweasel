/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.labs

import mozilla.components.service.nimbus.NimbusApi
import mozilla.components.support.base.feature.LifecycleAwareFeature
import org.mozilla.experiments.nimbus.EnrolledExperiment
import org.mozilla.experiments.nimbus.NimbusInterface
import org.mozilla.fenix.settings.labs.store.LabsAction
import org.mozilla.fenix.settings.labs.store.LabsStore

/**
 * A [LifecycleAwareFeature] that keeps the Firefox Labs screen in sync with Nimbus. It refreshes
 * [store] whenever Nimbus applies enrollment changes mid-session, such as an unenroll forced by a
 * failed Gecko pref update.
 *
 * @param store The [LabsStore] to refresh when Nimbus reports enrollment changes.
 * @param nimbusApi The [NimbusApi] to observe for enrollment changes.
 */
class LabsRefreshFeature(
    private val store: LabsStore,
    private val nimbusApi: NimbusApi,
) : LifecycleAwareFeature, NimbusInterface.Observer {

    override fun start() {
        nimbusApi.register(this)
    }

    override fun stop() {
        nimbusApi.unregister(this)
    }

    override fun onUpdatesApplied(updated: List<EnrolledExperiment>) {
        store.dispatch(LabsAction.RefreshLabs)
    }
}
