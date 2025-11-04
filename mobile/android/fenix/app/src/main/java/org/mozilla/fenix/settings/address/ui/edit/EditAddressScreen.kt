/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

@file:OptIn(ExperimentalMaterial3Api::class)

package org.mozilla.fenix.settings.address.ui.edit

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.Dropdown
import mozilla.components.compose.base.annotation.FlexibleWindowLightDarkPreview
import mozilla.components.compose.base.button.DestructiveButton
import mozilla.components.compose.base.button.FilledButton
import mozilla.components.compose.base.button.OutlinedButton
import mozilla.components.compose.base.menu.MenuItem
import mozilla.components.compose.base.textfield.TextField
import mozilla.components.compose.base.textfield.TextFieldColors
import mozilla.components.lib.state.ext.observeAsState
import org.mozilla.fenix.R
import org.mozilla.fenix.settings.address.Country
import org.mozilla.fenix.settings.address.store.AddressState
import org.mozilla.fenix.settings.address.store.AddressStore
import org.mozilla.fenix.settings.address.store.CancelTapped
import org.mozilla.fenix.settings.address.store.DeleteTapped
import org.mozilla.fenix.settings.address.store.FormChange
import org.mozilla.fenix.settings.address.store.SaveTapped
import org.mozilla.fenix.settings.address.store.ViewAppeared
import org.mozilla.fenix.settings.address.store.isEditing
import org.mozilla.fenix.settings.address.store.selectedCountry
import org.mozilla.fenix.theme.FirefoxTheme
import mozilla.components.compose.base.text.Text as DropdownText

/**
 * The UI host for the Edit Address Screen.
 *
 * @param store the [AddressStore] used to power the screen.
 */
@Composable
fun EditAddressScreen(store: AddressStore) {
    Scaffold(
        topBar = {
            EditAddressTopBar(store)
        },
        containerColor = FirefoxTheme.colors.layer1,
    ) { paddingValues ->
        DeleteAddressDialog(store)

        val state by store.observeAsState(store.state) { it }
        val address = state.address

        val focusRequester = remember { FocusRequester() }

        LaunchedEffect(Unit) {
            focusRequester.requestFocus()
        }

        Column(
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier
                .padding(paddingValues)
                .padding(
                    horizontal = FirefoxTheme.layout.space.static200,
                    vertical = FirefoxTheme.layout.space.static100,
                )
                .imePadding()
                .verticalScroll(state = rememberScrollState()),
        ) {
            AddressField(
                field = Field.name,
                value = address.name,
                modifier = Modifier.focusRequester(focusRequester),
            ) {
                store.dispatch(FormChange.Name(it))
            }
            AddressField(field = Field.streetAddress, value = address.streetAddress) {
                store.dispatch(FormChange.StreetAddress(it))
            }
            AddressField(field = Field.city, value = address.addressLevel2) {
                store.dispatch(FormChange.City(it))
            }

            state.selectedCountry?.let { country ->
                SubregionDropdown(
                    subregionTitleResource = country.subregionTitleResource,
                    subregions = country.subregions,
                    currentSubregion = state.address.addressLevel1,
                    onSubregionChange = { store.dispatch(FormChange.SubRegion(it)) },
                )
            }

            AddressField(field = Field.zip, value = address.postalCode) {
                store.dispatch(FormChange.PostalCode(it))
            }

            CountryDropdown(
                availableCountries = state.availableCountries,
                onCountryChange = { store.dispatch(FormChange.Country(it)) },
                currentCountry = state.address.country,
            )

            AddressField(field = Field.phone, value = address.tel) {
                store.dispatch(FormChange.Phone(it))
            }
            AddressField(field = Field.email, value = address.email) {
                store.dispatch(FormChange.Email(it))
            }

            FormButtons(store)
        }
    }
}

@Composable
private fun CountryDropdown(
    availableCountries: Map<String, Country>,
    onCountryChange: (String) -> Unit = {},
    currentCountry: String,
) {
    val countryList = availableCountries.map { (countryKey, countryValue) ->
        MenuItem.CheckableItem(DropdownText.String(countryValue.displayName), currentCountry == countryKey) {
            onCountryChange(countryKey)
        }
    }
    AddressDropdown(Field.country, countryList)
}

@Composable
private fun SubregionDropdown(
    @StringRes subregionTitleResource: Int,
    subregions: List<String>,
    currentSubregion: String?,
    onSubregionChange: (String) -> Unit = {},
) {
    val countryList = subregions.map {
        MenuItem.CheckableItem(
            DropdownText.String(it),
            currentSubregion == it,
        ) {
            onSubregionChange(it)
        }
    }

    AddressDropdown(
        Field.subregion(subregionTitleResource),
        countryList,
    )
}

@Composable
private fun FormButtons(store: AddressStore) {
    Row {
        if (store.state.isEditing) {
            DestructiveButton(
                text = stringResource(R.string.addressess_delete_address_button),
                modifier = Modifier.testTag(EditAddressTestTag.DELETE_BUTTON),
            ) {
                store.dispatch(DeleteTapped)
            }
        }

        Spacer(Modifier.weight(1f))

        OutlinedButton(
            text = stringResource(R.string.addresses_cancel_button),
            modifier = Modifier.testTag(EditAddressTestTag.CANCEL_BUTTON),
        ) {
            store.dispatch(CancelTapped)
        }

        Spacer(Modifier.width(8.dp))

        FilledButton(
            text = stringResource(R.string.addresses_save_button),
            modifier = Modifier.testTag(EditAddressTestTag.SAVE_BUTTON),
        ) {
            store.dispatch(SaveTapped)
        }
    }
}

@Composable
private fun AddressField(
    field: Field,
    value: String,
    modifier: Modifier = Modifier,
    onChange: (String) -> Unit,
) {
    TextField(
        value = value,
        onValueChange = onChange,
        placeholder = "",
        errorText = "",
        modifier = modifier.testTag(field.testTag),
        label = stringResource(field.labelId),
        colors = TextFieldColors.default(
            placeholderColor = FirefoxTheme.colors.textPrimary,
        ),

    )
}

@Composable
private fun AddressDropdown(
    field: Field,
    dropdownItems: List<MenuItem.CheckableItem>,
) {
    Dropdown(
        label = stringResource(field.labelId),
        placeholder = "",
        dropdownItems = dropdownItems,
        modifier = Modifier.testTag(field.testTag),
    )
}

internal data class Field(
    @get:StringRes val labelId: Int,
    val testTag: String,
) {
    companion object {
        val name: Field
            get() = Field(R.string.addresses_name, EditAddressTestTag.NAME_FIELD)

        val streetAddress: Field
            get() = Field(R.string.addresses_street_address, EditAddressTestTag.STREET_ADDRESS_FIELD)

        val city: Field
            get() = Field(R.string.addresses_city, EditAddressTestTag.CITY_FIELD)

        val zip: Field
            get() = Field(R.string.addresses_zip, EditAddressTestTag.ZIP_FIELD)

        val country: Field
            get() = Field(R.string.addresses_country, EditAddressTestTag.COUNTRY_FIELD)

        fun subregion(@StringRes titleResource: Int) = Field(titleResource, EditAddressTestTag.SUBREGION_FIELD)

        val phone: Field
            get() = Field(R.string.addresses_phone, EditAddressTestTag.PHONE_FIELD)

        val email: Field
            get() = Field(R.string.addresses_email, EditAddressTestTag.EMAIL_FIELD)
    }
}

@FlexibleWindowLightDarkPreview
@Composable
private fun EditAddressPreview() {
    val store = AddressStore(AddressState.initial(), listOf()).also { it.dispatch(ViewAppeared) }
    FirefoxTheme {
        EditAddressScreen(store)
    }
}
