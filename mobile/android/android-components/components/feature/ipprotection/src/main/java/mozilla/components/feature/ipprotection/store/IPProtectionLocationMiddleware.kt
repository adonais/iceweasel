/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.ipprotection.store

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import mozilla.components.ExperimentalAndroidComponentsApi
import mozilla.components.feature.ipprotection.store.state.Country
import mozilla.components.feature.ipprotection.store.state.IPProtectionState
import mozilla.components.feature.ipprotection.store.state.Location
import mozilla.components.feature.ipprotection.store.state.Recommended
import mozilla.components.lib.state.Middleware
import mozilla.components.lib.state.Store

/**
 * [Middleware] responsible for persisting and restoring the selected IP protection location using
 * [IPProtectionLocationRepository].
 *
 * @param repository [IPProtectionLocationRepository] persistent storage interface.
 * @param coroutineScope [CoroutineScope] used to launch coroutines.
 */
@OptIn(ExperimentalAndroidComponentsApi::class)
class IPProtectionLocationMiddleware(
    private val repository: IPProtectionLocationRepository,
    private val coroutineScope: CoroutineScope = CoroutineScope(Dispatchers.IO),
) : Middleware<IPProtectionState, IPProtectionAction> {

    private var lastStorageJob: Job? = null

    override fun invoke(
        store: Store<IPProtectionState, IPProtectionAction>,
        next: (IPProtectionAction) -> Unit,
        action: IPProtectionAction,
    ) {
        next(action)

        val selectedLocation = store.state.locationState.selectedLocation

        when (action) {
            is IPProtectionAction.CountryListChanged ->
                launchInOrder {
                    handleCountryListChanged(action, store, selectedLocation)
                }

            is IPProtectionAction.LocationChanged,
            is IPProtectionAction.LocationReset -> launchInOrder { persistLocationCode(selectedLocation.countryCode) }

            is IPProtectionAction.AccountStateChanged,
            is IPProtectionAction.ActivationRequestCompleted,
            is IPProtectionAction.CheckAccount,
            is IPProtectionAction.CheckLocations,
            is IPProtectionAction.EligibilityChanged,
            is IPProtectionAction.PersistedLocationUnavailable,
            is IPProtectionAction.LocationSwitchFailed,
            is IPProtectionAction.LocationUpdateFailed,
            is IPProtectionAction.ProxyActivationShown,
            is IPProtectionAction.ProxyStateChanged,
            is IPProtectionAction.ServiceStateChanged,
            is IPProtectionAction.Toggle,
            is IPProtectionAction.ToggleFailed,
            is IPProtectionAction.UsageChanged,
            is InternalAction.AccountManagerStateChanged,
            is InternalAction.AccountReadyForEnrollment,
            is InternalAction.AwaitingAuth,
            is InternalAction.EligibilityChanged,
            is InternalAction.FinishingAuthFlow,
            is InternalAction.FinishingEnrollment -> {
                // no-op
            }
        }
    }

    private suspend fun persistLocationCode(code: String?) {
        repository.setSelectedLocationCode(code)
    }

    private suspend fun handleCountryListChanged(
        action: IPProtectionAction.CountryListChanged,
        store: Store<IPProtectionState, IPProtectionAction>,
        selectionAtDispatch: Location,
    ) {
        val cachedLocationCode = repository.getSelectedLocationCode()
        val currentSelection = store.state.locationState.selectedLocation

        // A selection made after this list arrived is newer than the stored one and must be kept.
        val locationCode =
            if (currentSelection == selectionAtDispatch) {
                cachedLocationCode
            } else {
                currentSelection.countryCode
            }

        val listed = action.countries.find { it.code == locationCode }
        val selectedLocation =
            listed?.takeIf { it.available }?.let { Country(countryCode = it.code, available = it.available) }

        if (selectedLocation != null) {
            // if we have found the cached selection in the update list, we should check if that's
            // the selected location, and - if it is not - update it.
            if (selectedLocation != currentSelection) {
                store.dispatch(IPProtectionAction.LocationChanged(location = selectedLocation, userAction = false))
            }
        } else {
            // if we couldn't find the cached selection, we should clear the cached value and
            // update the selected location to the default.
            val status = if (listed == null) CachedLocationStatus.Missing else CachedLocationStatus.Unavailable
            if (currentSelection != Recommended) {
                store.dispatch(IPProtectionAction.LocationReset(locationCode, status))
            } else if (locationCode != null) {
                store.dispatch(IPProtectionAction.PersistedLocationUnavailable(locationCode, status))
            }

            repository.setSelectedLocationCode(null)
        }
    }

    private fun launchInOrder(block: suspend () -> Unit) {
        // Chained so that storage operations run in dispatch order.
        val previousJob = lastStorageJob
        lastStorageJob = coroutineScope.launch {
            previousJob?.join()
            block()
        }
    }
}
