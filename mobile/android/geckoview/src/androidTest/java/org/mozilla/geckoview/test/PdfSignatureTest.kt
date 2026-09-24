/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

package org.mozilla.geckoview.test

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.MediumTest
import org.hamcrest.Matchers.equalTo
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.mozilla.geckoview.PdfViewerController.PdfViewerException

@RunWith(AndroidJUnit4::class)
@MediumTest
class PdfSignatureTest : BaseSessionTest() {

    @Test
    fun addSignatureWhenNotAPdf() {
        mainSession.loadTestPath(HELLO_HTML_PATH)
        mainSession.waitForPageStop()

        try {
            sessionRule.waitForResult(mainSession.pdfViewerEditor.addSignature("Test"))
            fail("Should not add a signature to a non-PDF.")
        } catch (e: RuntimeException) {
            val exception = e.cause as PdfViewerException
            assertThat(
                "Should report that the document is not a PDF.",
                exception.code,
                equalTo(PdfViewerException.ERROR_NOT_A_PDF),
            )
        }
    }
}
