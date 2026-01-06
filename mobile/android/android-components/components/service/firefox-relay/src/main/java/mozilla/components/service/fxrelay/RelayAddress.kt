/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.service.fxrelay

/**
 * Represents a Relay email address object.
 *
 * Includes metadata and statistics for an alias, such as its status, usage stats, and identifying
 * information.
 */
data class RelayAddress(
    var maskType: String,
    var enabled: Boolean,
    var description: String,
    var generatedFor: String,
    var blockListEmails: Boolean,
    var usedOn: String?,
    var id: Long,
    var address: String,
    var domain: Long,
    var fullAddress: String,
    var createdAt: String,
    var lastModifiedAt: String,
    var lastUsedAt: String?,
    var numForwarded: Long,
    var numBlocked: Long,
    var numLevelOneTrackersBlocked: Long,
    var numReplied: Long,
    var numSpam: Long,
)

// We might want to remove the parameters we do not need before publishing the component.
// Waiting to have a better understanding of API's and what data we actually need.
// Clean up in: https://bugzilla.mozilla.org/show_bug.cgi?id=2002124
internal fun mozilla.appservices.relay.RelayAddress.into(): RelayAddress {
    return RelayAddress(
        maskType = this.maskType,
        enabled = this.enabled,
        description = this.description,
        generatedFor = this.generatedFor,
        blockListEmails = this.blockListEmails,
        usedOn = this.usedOn,
        id = this.id,
        address = this.address,
        domain = this.domain,
        fullAddress = this.fullAddress,
        createdAt = this.createdAt,
        lastModifiedAt = this.lastModifiedAt,
        lastUsedAt = this.lastUsedAt,
        numForwarded = this.numForwarded,
        numBlocked = this.numBlocked,
        numLevelOneTrackersBlocked = this.numLevelOneTrackersBlocked,
        numReplied = this.numReplied,
        numSpam = this.numSpam,
    )
}
