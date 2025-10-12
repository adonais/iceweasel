/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.address.store

import mozilla.components.browser.state.search.RegionState
import mozilla.components.concept.storage.Address
import mozilla.components.concept.storage.UpdatableAddressFields
import mozilla.components.lib.state.State
import org.mozilla.fenix.settings.address.AddressUtils
import org.mozilla.fenix.settings.address.Country
import org.mozilla.fenix.settings.address.DEFAULT_COUNTRY

/**
 * Represents the state of the deletion dialog.
 */
sealed class DialogState {
    /**
     * Waiting to be presented.
     */
    data object Inert : DialogState()

    /**
     * Currently being presented.
     */
    data object Presenting : DialogState()
}

/**
 * Represents the state of the Bookmarks list screen and its various subscreens.
 *
 * @property guidToUpdate guid of the address we are editing.
 * @property address updatable properties of the address.
 * @property deleteDialog state for the dialog that is presented when deleting an address.
 * @property region the region used to calculate the default country.
 * @property availableCountries a map containing the available countries.
 */
data class AddressState(
    val guidToUpdate: String?,
    val address: UpdatableAddressFields,
    val deleteDialog: DialogState = DialogState.Inert,
    val region: RegionState? = RegionState.Default,
    val availableCountries: Map<String, Country> = AddressUtils.countries,
) : State {
    /**
     * Static functions for [AddressState]
     */
    companion object {
        /**
         * Creates a new [AddressState] with [UpdatableAddressFields] pre-filled with the values from
         * [Address].
         *
         * @param region The current [RegionState] of a user.
         * @param address [Address] for creating the [UpdatableAddressFields].
         */
        fun initial(
            region: RegionState? = RegionState.Default,
            address: Address? = null,
            ): AddressState {
            return AddressState(
                guidToUpdate = address?.guid,
                region = region,
                address = UpdatableAddressFields(
                    name = address?.name ?: "",
                    organization = address?.organization ?: "",
                    streetAddress = address?.streetAddress ?: "",
                    addressLevel3 = address?.addressLevel3 ?: "",
                    addressLevel2 = address?.addressLevel2 ?: "",
                    addressLevel1 = address?.addressLevel1 ?: "",
                    postalCode = address?.postalCode ?: "",
                    country = address?.country ?: "",
                    tel = address?.tel ?: "",
                    email = address?.email ?: "",
                ),
            )
        }
    }
}

internal val AddressState.selectedCountry: Country?
    get() = availableCountries[address.country.ifBlank { DEFAULT_COUNTRY }]

internal val AddressState.isEditing: Boolean
    get() = guidToUpdate != null

internal fun AddressState.update(transform: UpdatableAddressFields.() -> UpdatableAddressFields): AddressState {
    return copy(address = address.transform())
}
