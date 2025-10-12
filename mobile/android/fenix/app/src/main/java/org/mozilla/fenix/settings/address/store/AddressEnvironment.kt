/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.address.store

import mozilla.components.concept.storage.Address
import mozilla.components.concept.storage.UpdatableAddressFields

/**
 * An interface for handling back navigation.
 */
fun interface NavigateBack {
    /**
     * navigate back.
     */
    fun navigateBack()
}

/**
 * An interface for handling creating a new [Address]
 */
fun interface CreateAddress {
    /**
     * Creates an [Address].
     *
     * @param address [UpdatableAddressFields] used to create an address
     * @return the guid of the newly created [Address] as a [String]
     */
    suspend fun createAddress(address: UpdatableAddressFields): String
}

/**
 * An interface for updating an [Address]
 */
fun interface UpdateAddress {
    /**
     * Updates an [Address].
     *
     * @param guid of the [Address] to update.
     * @param address [UpdatableAddressFields] used to update an address
     */
    suspend fun updateAddress(guid: String, address: UpdatableAddressFields)
}

/**
 * An interface for handling deleting an [Address]
 */
fun interface DeleteAddress {
    /**
     * Deletes an [Address].
     *
     * @param guid the id of the [Address] to delete.
     */
    suspend fun deleteAddress(guid: String)
}

/**
 * Groups together all of the [AddressStore] dependencies.
 *
 * @param navigateBack used to navigate back.
 * @param createAddress used to create a new [Address].
 * @param updateAddress used to update an existing [Address].
 * @param deleteAddress used to delete an [Address].
 */
data class AddressEnvironment(
    private val navigateBack: NavigateBack,
    private val createAddress: CreateAddress,
    private val updateAddress: UpdateAddress,
    private val deleteAddress: DeleteAddress,
) : NavigateBack by navigateBack,
    CreateAddress by createAddress,
    UpdateAddress by updateAddress,
    DeleteAddress by deleteAddress {
        internal companion object {
            val empty: AddressEnvironment
                get() = AddressEnvironment(
                    navigateBack = { },
                    createAddress = { "empty-guid" },
                    updateAddress = { _, _ -> },
                    deleteAddress = { },
                )
        }
    }
