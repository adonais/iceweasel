/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.address.store

import org.mozilla.fenix.settings.address.DEFAULT_COUNTRY

/**
 * Function for reducing a new address state based on the received action.
 */
fun addressReducer(state: AddressState, action: AddressAction): AddressState {
    return when (action) {
        ViewAppeared -> state.update {
            val countryCode = country
                .ifBlank { state.region?.home }
                .takeIf { it in state.availableCountries.keys } ?: DEFAULT_COUNTRY

            val subRegions = state.availableCountries[countryCode]?.subregions ?: listOf()
            val subRegion = addressLevel1
                .takeIf { it in subRegions } ?: subRegions.first()

            copy(
                addressLevel1 = subRegion,
                country = countryCode,
            )
        }
        is FormChange.Name -> state.update { copy(name = action.updatedText) }
        is FormChange.StreetAddress -> state.update { copy(streetAddress = action.updatedText) }
        is FormChange.City -> state.update { copy(addressLevel2 = action.updatedText) }
        is FormChange.SubRegion -> state.update { copy(addressLevel1 = action.subRegion) }
        is FormChange.PostalCode -> state.update { copy(postalCode = action.updatedText) }
        is FormChange.Country -> state.update {
            val subRegions = state.availableCountries[action.countryCode]?.subregions ?: listOf()
            val subRegion = addressLevel1
                .takeIf { it in subRegions } ?: subRegions.first()
            copy(
                addressLevel1 = subRegion,
                country = action.countryCode,
            )
        }
        is FormChange.Phone -> state.update { copy(tel = action.updatedText) }
        is FormChange.Email -> state.update { copy(email = action.updatedText) }
        is DeleteTapped -> state.copy(deleteDialog = DialogState.Presenting)
        is DeleteDialogAction.CancelTapped -> state.copy(deleteDialog = DialogState.Inert)
        is DeleteDialogAction.DeleteTapped,
        is EnvironmentRehydrated, BackTapped, CancelTapped, SaveTapped,
            -> state
    }
}
