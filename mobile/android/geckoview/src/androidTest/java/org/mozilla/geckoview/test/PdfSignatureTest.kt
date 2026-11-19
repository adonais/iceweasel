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
import org.mozilla.geckoview.test.rule.GeckoSessionTestRule.WithDisplay

@RunWith(AndroidJUnit4::class)
@MediumTest
class PdfSignatureTest : BaseSessionTest() {

    private fun savedBytes(): ByteArray? = sessionRule.waitForResult(mainSession.pdfFileSaver.save()).body?.readBytes()

    @Test
    @WithDisplay(width = 400, height = 600)
    fun addSignatureToPdf() {
        sessionRule.setPrefsUntilTestEnd(
            mapOf(
                "pdfjs.enableSignatureEditor" to true,
                "pdfjs.annotationEditorMode" to 0,
            )
        )

        mainSession.loadTestPath(TRACEMONKEY_PDF_PATH)
        mainSession.waitForPageStop()

        sessionRule.waitForResult(mainSession.pdfViewerEditor.addSignature("Test User"))

        assertThat(
            "The signature should be committed to the saved document.",
            savedBytes()?.contentEquals(getTestBytes(TRACEMONKEY_PDF_PATH)),
            equalTo(false),
        )
    }

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

    // Bug 2079932
    @Test
    fun addSignatureAfterCrossSiteNavigation() {
        mainSession.loadTestPath(TRACEMONKEY_PDF_PATH)
        mainSession.waitForPageStop()

        mainSession.loadUri("https://example.org/tests/junit/hello.html")
        mainSession.waitForPageStop()

        mainSession.loadTestPath(TRACEMONKEY_PDF_PATH)
        mainSession.waitForPageStop()

        sessionRule.waitForResult(mainSession.pdfViewerEditor.addSignature("Test"))
    }
}
