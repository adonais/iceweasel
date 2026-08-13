# META: timeout=long

import pytest
from tests.support.classic.asserts import assert_error, assert_success

from . import refresh

ABOUT_URL = "about:about"


@pytest.mark.geckodriver(allow_system_access=True)
def test_refresh_about_url_with_system_access(session, new_tab_classic):
    session.url = ABOUT_URL
    assert session.url == ABOUT_URL

    response = refresh(session)
    assert_success(response)
    assert session.url == ABOUT_URL


@pytest.mark.geckodriver(allow_system_access=True)
def test_refresh_moz_extension_url_with_system_access(
    session, install_new_tab_extension
):
    handle, url = install_new_tab_extension
    session.window_handle = handle
    assert session.url.startswith("moz-extension://")

    response = refresh(session)
    assert_success(response)
    assert session.url == url


def test_refresh_about_url_without_system_access(parent_process_session):
    session = parent_process_session
    assert session.url == ABOUT_URL

    response = refresh(session)
    assert_error(response, "unsupported operation")


def test_refresh_moz_extension_url_without_system_access(
    session, install_new_tab_extension
):
    handle, _ = install_new_tab_extension
    session.window_handle = handle
    assert session.url.startswith("moz-extension://")

    response = refresh(session)
    assert_error(response, "unsupported operation")
