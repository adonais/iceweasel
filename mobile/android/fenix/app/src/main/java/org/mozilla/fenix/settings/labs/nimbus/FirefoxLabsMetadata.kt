/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.settings.labs.nimbus

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Resources
import mozilla.components.support.base.log.logger.Logger
import org.mozilla.experiments.nimbus.internal.FirefoxLabsMetadata
import org.mozilla.fenix.Config
import org.mozilla.fenix.settings.labs.LabsItem

private val logger = Logger("FirefoxLabsMetadata")

/**
 * Converts a [FirefoxLabsMetadata] from Nimbus into a [LabsItem] by resolving its title and
 * description resource names.
 *
 * @param context The [Context] used to resolve string resources.
 * @param allowRawIdFallback Determines how to handle missing resource names.
 *
 * If [allowRawIdFallback] is true, and no string is found for that resource name,
 * then the raw resource name will be set as the string itself (for debugging and QE identification purposes).
 * For example, if Nimbus delivers `firefox_labs_unknown_lab` and no string resource by that name exists,
 * the [LabsItem]'s title is rendered as the literal text `firefox_labs_unknown_lab`.
 *
 * If [allowRawIdFallback] is false, and no string is found for that resource name, then the [LabsItem]
 * is returned as null and will not be rendered.
 */
internal fun FirefoxLabsMetadata.toLabsItem(
    context: Context,
    allowRawIdFallback: Boolean = Config.channel.isNightlyOrDebug,
): LabsItem? {
    val title = getStringResource(context, titleStringId, slug, allowRawIdFallback) ?: return null
    val description = getStringResource(context, descriptionStringId, slug, allowRawIdFallback) ?: return null

    return LabsItem(
        slug = slug,
        title = title,
        description = description,
        enrolled = enrolled,
        requiresRestart = requiresRestart,
        feedbackUrl = feedbackUrl,
    )
}

/**
 * Get the string resource from a Nimbus-provided resource name.
 *
 * @param context The [Context] used to resolve string resources.
 * @param resourceName The Nimbus resource name to look up.
 * @param slug The slug of the Lab the resource name belongs to, used for logging.
 * @param allowRawIdFallback Whether to return [resourceName] when the resource cannot be resolved.
 */
@SuppressLint("DiscouragedApi")
private fun getStringResource(
    context: Context,
    resourceName: String,
    slug: String,
    allowRawIdFallback: Boolean,
): String? {
    return try {
        val resourceId = context.resources.getIdentifier(
            resourceName,
            "string",
            context.packageName,
        )
        if (resourceId == 0) {
            logger.warn("Could not resolve string resource for Lab '$slug': $resourceName")
            return if (allowRawIdFallback) resourceName else null
        }

        context.getString(resourceId)
    } catch (e: Resources.NotFoundException) {
        logger.warn("String resource not found for Lab '$slug': $resourceName", e)
        if (allowRawIdFallback) resourceName else null
    }
}
