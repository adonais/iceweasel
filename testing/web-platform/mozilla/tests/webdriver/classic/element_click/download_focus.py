import time


def get_document_focus(session):
    return session.execute_script("return document.hasFocus();")


# In this test case, we want to verify that when a download begins
# the focus will not be moved to the download panel.
# Since the test is not directly related to the element click
# command, the test is in the Mozilla-specific folder.
def test_download_focus(session, inline):
    session.url = inline(
        f"""<a id="download_link" href="{inline("")}" download="some_file.txt">download</a>"""
    )

    assert get_document_focus(session) is True

    session.find.css("#download_link", all=False).click()

    # Wait for download popup to open.
    time.sleep(1)

    assert get_document_focus(session) is True
