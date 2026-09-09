/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.fenix.pdf

/**
 * The callbacks for the PDF tool buttons.
 *
 * @property onSignClick Invoked when the user activates the sign PDF button.
 * @property onDownloadClick Invoked when the user activates the download PDF button.
 * @property onPrintClick Invoked when the user activates the print PDF button.
 * @property onShareClick Invoked when the user activates the share PDF button.
 */
internal data class PdfToolActions(
    val onSignClick: () -> Unit,
    val onDownloadClick: () -> Unit,
    val onPrintClick: () -> Unit,
    val onShareClick: () -> Unit,
)
