/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.prompts.address

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import mozilla.components.compose.base.button.FilledButton
import mozilla.components.compose.base.button.TextButton
import mozilla.components.compose.base.theme.AcornTheme
import mozilla.components.concept.storage.Address
import mozilla.components.feature.prompts.R
import mozilla.components.feature.prompts.address.ext.toDisplayLines
import mozilla.components.ui.icons.R as iconsR

/**
 * Read-only confirmation dialog content for the address-capture prompt.
 *
 * @param address The candidate [Address] to display.
 * @param onSave Invoked when the user confirms the save.
 * @param onCancel Invoked when the user dismisses without saving.
 */
@Composable
internal fun AddressSaveDialogContent(
    address: Address,
    onSave: () -> Unit,
    onCancel: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(AcornTheme.layout.space.static200),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    painter = painterResource(iconsR.drawable.mozac_ic_lock_24),
                    contentDescription = null,
                    modifier = Modifier.size(24.dp),
                    tint = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = stringResource(R.string.mozac_feature_prompts_save_address_prompt_title),
                    style = AcornTheme.typography.headline7,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            AddressLines(
                address = address,
                modifier = Modifier.padding(
                    start = AcornTheme.layout.space.static300 + AcornTheme.layout.space.static150,
                    end = AcornTheme.layout.space.static200,
                ),
            )

            Spacer(modifier = Modifier.height(20.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    text = stringResource(R.string.mozac_feature_prompt_not_now),
                    onClick = onCancel,
                )
                Spacer(modifier = Modifier.width(8.dp))
                FilledButton(
                    text = stringResource(R.string.mozac_feature_prompt_save_confirmation),
                    onClick = onSave,
                )
            }
        }
    }
}

/**
 * Renders the candidate [address] as a stack of read-only lines. Each entry is constrained to a
 * single line and ellipsized so an oversized field cannot inflate the height of the prompt.
 *
 * @param address The candidate [Address] to display.
 * @param modifier The [Modifier] to be applied to the layout.
 */
@Composable
private fun AddressLines(
    address: Address,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        address.toDisplayLines().forEach { line ->
            Text(
                text = line,
                style = AcornTheme.typography.body2,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@PreviewLightDark
@Composable
private fun AddressSaveDialogContentPreview() {
    AcornTheme {
        AddressSaveDialogContent(
            address = Address(
                guid = "",
                name = "John Doe",
                organization = "Mozilla",
                streetAddress = "999 Test Street",
                addressLevel3 = "",
                addressLevel2 = "Mountain View",
                addressLevel1 = "CA",
                postalCode = "94016",
                country = "US",
                tel = "+15551234567",
                email = "john@example.com",
            ),
            onSave = {},
            onCancel = {},
        )
    }
}

@PreviewLightDark
@Composable
private fun AddressSaveDialogContentLongAddressPreview() {
    AcornTheme {
        AddressSaveDialogContent(
            address = Address(
                guid = "",
                name = "Johnathan Maximilian Alexander Doe-Fitzgerald III",
                organization = "Mozilla Corporation International Headquarters Division",
                streetAddress = "999 Test Street, Building 7, Floor 42, Suite 4200, North Wing",
                addressLevel3 = "",
                addressLevel2 = "San Francisco-Mountain View Metropolitan Area",
                addressLevel1 = "California",
                postalCode = "94016-1234",
                country = "United States of America",
                tel = "+1 (555) 123-4567 ext. 89012",
                email = "johnathan.maximilian.alexander.doe-fitzgerald@example.com",
            ),
            onSave = {},
            onCancel = {},
        )
    }
}
