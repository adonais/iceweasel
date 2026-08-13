# META: timeout=long

import pytest
from tests.support.classic.asserts import assert_error, assert_success

from . import back

ABOUT_URL = "about:about"


# To minimize Firefox restarts, run tests requiring system access first,
# followed by those that don't; so only one restart is needed.


@pytest.mark.geckodriver(allow_system_access=True)
def test_navigate_back_to_about_url_with_system_access(
    session, new_tab_classic, inline
):
    session.url = ABOUT_URL
    assert session.url == ABOUT_URL

    page = inline("<p>content page")
    session.url = page
    assert session.url == page

    response = back(session)
    assert_success(response)
    assert session.url == ABOUT_URL


@pytest.mark.geckodriver(allow_system_access=True)
def test_navigate_back_to_moz_extension_url_with_system_access(
    session, install_new_tab_extension, inline
):
    handle, ext_url = install_new_tab_extension
    session.window_handle = handle
    assert session.url.startswith("moz-extension://")

    page = inline("<p>content page")
    session.url = page
    assert session.url == page

    response = back(session)
    assert_success(response)
    assert session.url == ext_url


def test_navigate_back_to_about_url_without_system_access(
    parent_process_session, inline
):
    session = parent_process_session

    page = inline("<p>content page")
    session.url = page
    assert session.url == page

    response = back(session)
    assert_error(response, "unsupported operation")


def test_navigate_back_to_moz_extension_url_without_system_access(
    session, install_new_tab_extension, inline
):
    handle, _ = install_new_tab_extension
    session.window_handle = handle
    assert session.url.startswith("moz-extension://")

    page = inline("<p>content page")
    session.url = page
    assert session.url == page

    response = back(session)
    assert_error(response, "unsupported operation")
