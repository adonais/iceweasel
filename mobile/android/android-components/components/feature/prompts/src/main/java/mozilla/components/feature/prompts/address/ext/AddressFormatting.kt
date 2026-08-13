/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.prompts.address.ext

import mozilla.components.concept.storage.Address

/**
 * Builds a human-readable, multi-line representation of an [Address] suitable for displaying in
 * a save-confirmation prompt. Empty fields are skipped so the rendered block stays compact.
 */
internal fun Address.toDisplayLines(): List<String> {
    val lines = mutableListOf<String>()

    name.takeIfNotBlank()?.let { lines.add(it) }
    organization.takeIfNotBlank()?.let { lines.add(it) }
    streetAddress.takeIfNotBlank()?.let { lines.add(it) }

    val cityRegionPostal = listOfNotNull(
        addressLevel2.takeIfNotBlank(),
        addressLevel1.takeIfNotBlank(),
        postalCode.takeIfNotBlank(),
    ).joinToString(separator = " ")
    if (cityRegionPostal.isNotEmpty()) lines.add(cityRegionPostal)

    country.takeIfNotBlank()?.let { lines.add(it) }
    tel.takeIfNotBlank()?.let { lines.add(it) }
    email.takeIfNotBlank()?.let { lines.add(it) }

    return lines
}

private fun String.takeIfNotBlank(): String? = takeIf { it.isNotBlank() }
