# META: timeout=long

import tempfile
from pathlib import Path

import pytest
from support.addons import get_internal_addon_id
from tests.support.classic.asserts import assert_error, assert_success
from tests.support.helpers import get_base64_for_extension_file

from ..addon_install import install_addon
from ..addon_uninstall import uninstall_addon
from . import navigate_to

ABOUT_URL = "about:about"
RESOURCE_URL = "resource://gre/modules/AppConstants.sys.mjs"


def chrome_url(session):
    if session.capabilities["platformName"] == "android":
        return "chrome://geckoview/content/geckoview.xhtml"
    return "chrome://browser/content/browser.xhtml"


# To minimize Firefox restarts, run tests requiring system access first,
# followed by those that don't; so only one restart is needed.


@pytest.mark.geckodriver(allow_system_access=True)
def test_about_url_with_system_access(session):
    response = navigate_to(session, ABOUT_URL)
    assert_success(response)
    assert session.url == ABOUT_URL


@pytest.mark.geckodriver(allow_system_access=True)
def test_chrome_url_with_system_access(session):
    url = chrome_url(session)

    response = navigate_to(session, url)
    assert_success(response)
    assert session.url == url


@pytest.mark.geckodriver(allow_system_access=True)
def test_moz_extension_url_with_system_access(session):
    response = install_addon(
        session, "addon", get_base64_for_extension_file("firefox/unsigned.xpi"), False
    )
    addon_id = assert_success(response)

    try:
        internal_id = get_internal_addon_id(session, addon_id)
        ext_url = f"moz-extension://{internal_id}/manifest.json"

        response = navigate_to(session, ext_url)
        assert_success(response)
        assert session.url == ext_url
    finally:
        uninstall_addon(session, addon_id)


@pytest.mark.geckodriver(allow_system_access=True)
def test_resource_url_with_system_access(session):
    response = navigate_to(session, RESOURCE_URL)
    assert_success(response)
    assert session.url == RESOURCE_URL


@pytest.mark.geckodriver(allow_system_access=True)
@pytest.mark.parametrize(
    "url",
    ["data:text/html,<h1>test</h1>", "javascript:void(0)"],
    ids=["data", "javascript"],
)
def test_inherit_principal_url_in_parent_process_context_with_system_access(
    session, url
):
    response = navigate_to(session, "about:about")
    assert_success(response)

    response = navigate_to(session, url)
    assert_success(response)


def test_about_url_without_system_access(session):
    response = navigate_to(session, ABOUT_URL)
    assert_error(response, "unsupported operation")


def test_chrome_url_without_system_access(session):
    response = navigate_to(session, chrome_url(session))
    assert_error(response, "unsupported operation")


def test_moz_extension_url_without_system_access(session, install_new_tab_extension):
    _, url = install_new_tab_extension

    response = navigate_to(session, url)
    assert_error(response, "unsupported operation")


def test_resource_url_without_system_access(session):
    response = navigate_to(session, RESOURCE_URL)
    assert_error(response, "unsupported operation")


@pytest.mark.parametrize("protocol", ["http", "https"])
def test_web_safe_url_in_parent_process_context_without_system_access(
    parent_process_session, inline, protocol
):
    page = inline("<p>foo", protocol=protocol)
    response = navigate_to(parent_process_session, page)
    assert_success(response)
    assert parent_process_session.url == page


def test_file_url_in_parent_process_context_without_system_access(
    parent_process_session,
):
    # Bug 2040913: Reduce page load timeout to prevent hangs on Android
    parent_process_session.timeouts.page_load = 3

    with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as f:
        f.write(b"<p>foo")
        file_url = Path(f.name).as_uri()

    response = navigate_to(parent_process_session, file_url)
    assert_success(response)
    assert parent_process_session.url == file_url


def test_blob_url_in_parent_process_context_without_system_access(
    parent_process_session,
):
    # Create a new tab to get a content process context for creating a blob URL.
    original_handle = parent_process_session.window_handle
    new_handle = parent_process_session.new_window(type_hint="tab")
    parent_process_session.window_handle = new_handle

    blob_url = parent_process_session.execute_script(
        """return URL.createObjectURL(
            new Blob(['<h1>test</h1>'], {type: 'text/html'})
        )"""
    )

    parent_process_session.window_handle = original_handle

    response = navigate_to(parent_process_session, blob_url)
    assert_success(response)


@pytest.mark.parametrize(
    "url",
    ["data:text/html,<h1>test</h1>", "javascript:void(0)"],
    ids=["data", "javascript"],
)
def test_inherit_principal_url_in_parent_process_context_without_system_access(
    parent_process_session, url
):
    response = navigate_to(parent_process_session, url)
    assert_error(response, "unsupported operation")


@pytest.mark.parametrize(
    "url",
    ["data:text/html,<h1>test</h1>", "javascript:void(0)"],
    ids=["data", "javascript"],
)
def test_inherit_principal_url_in_extension_process_context_without_system_access(
    session, install_new_tab_extension, url
):
    handle, _ = install_new_tab_extension

    session.window_handle = handle
    assert session.url.startswith("moz-extension://")

    response = navigate_to(session, url)
    assert_error(response, "unsupported operation")
