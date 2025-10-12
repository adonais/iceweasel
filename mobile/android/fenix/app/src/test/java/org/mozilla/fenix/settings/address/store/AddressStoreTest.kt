package org.mozilla.fenix.settings.address.store

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.CoroutineScope
import mozilla.components.concept.storage.Address
import mozilla.components.concept.storage.UpdatableAddressFields
import mozilla.components.support.test.rule.MainCoroutineRule
import mozilla.components.support.test.rule.runTestOnMain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AddressStoreTest {
    @get:Rule
    val coroutinesTestRule = MainCoroutineRule()

    @Test
    fun `GIVEN a store WHEN a user updates the address THEN the address is updated`() = runTestOnMain {
        val store = makeStore(this)
        assertEquals(store.state.address, emptyUpdatableAddress)

        listOf(
            FormChange.Name("Work"), FormChange.StreetAddress("Mozilla Lane"), FormChange.City("Level 2"),
            FormChange.SubRegion("This Should Change"), FormChange.PostalCode("31337"), FormChange.Country("US"),
            FormChange.Phone("555-555-5555"), FormChange.Email("mo@zilla.com"),
        ).forEach(store::dispatch)

        val expected = UpdatableAddressFields(
            name = "Work",
            organization = "",
            streetAddress = "Mozilla Lane",
            addressLevel1 = "Alabama",
            addressLevel2 = "Level 2",
            addressLevel3 = "",
            postalCode = "31337",
            country = "US",
            tel = "555-555-5555",
            email = "mo@zilla.com",
        )
        assertEquals(store.state.address, expected)
    }

    @Test
    fun `GIVEN a state with no guid WHEN a user taps save THEN create and navigateBack is called on the environment`() = runTestOnMain {
        var navigateBackCalled = false
        var createdAddress: UpdatableAddressFields? = null

        val store = makeStore(this) {
            copy(
                navigateBack = { navigateBackCalled = true },
                createAddress = {
                    createdAddress = it
                    "new-address-guid"
                },
            )
        }

        store.dispatch(FormChange.Name("Work"))
        store.dispatch(SaveTapped)

        val expected = emptyUpdatableAddress.copy(name = "Work")

        assertTrue(navigateBackCalled)
        assertEquals(expected, createdAddress!!)
    }

    @Test
    fun `GIVEN a state with an existing address WHEN a user taps save THEN update and navigateBack is called on the environment`() = runTestOnMain {
        var navigateBackCalled = false
        var updatedAddress: Pair<String, UpdatableAddressFields>? = null

        val initialAddress = Address("BEEF", "Work", "Mozilla", "", "", "", "", "", "", "", "")

        val store = makeStore(this, AddressState.initial(address = initialAddress)) {
            copy(
                navigateBack = { navigateBackCalled = true },
                updateAddress = { guid, address -> updatedAddress = Pair(guid, address) },
            )
        }

        store.dispatch(FormChange.Name("Home"))
        store.dispatch(SaveTapped)

        val expected = Pair("BEEF", emptyUpdatableAddress.copy(name = "Home", organization = "Mozilla"))

        assertTrue(navigateBackCalled)
        assertEquals(expected, updatedAddress)
    }

    @Test
    fun `GIVEN a state with an existing address WHEN a user taps save THEN delete and navigateBack is called on the environment`() = runTestOnMain {
        var navigateBackCalled = false
        var deletedGuid: String? = null

        val initialAddress = Address("BEEF", "Work", "Mozilla", "", "", "", "", "", "", "", "")

        val store = makeStore(this, AddressState.initial(address = initialAddress)) {
            copy(
                navigateBack = { navigateBackCalled = true },
                deleteAddress = { deletedGuid = it },
            )
        }

        assertEquals(DialogState.Inert, store.state.deleteDialog)
        store.dispatch(DeleteTapped)

        assertEquals(DialogState.Presenting, store.state.deleteDialog)
        store.dispatch(DeleteDialogAction.DeleteTapped)

        val expected = "BEEF"

        assertTrue(navigateBackCalled)
        assertEquals(expected, deletedGuid)
    }
}

private val emptyUpdatableAddress = UpdatableAddressFields("", "", "", "", "", "", "", "", "", "")

private fun makeStore(
    scope: CoroutineScope,
    state: AddressState = AddressState.initial(),
    transform: AddressEnvironment.() -> AddressEnvironment = { this },
): AddressStore {
    return AddressStore(
        state,
        listOf(AddressMiddleware(AddressEnvironment.empty.transform(), scope)),
    )
}
