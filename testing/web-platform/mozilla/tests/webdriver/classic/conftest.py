import base64
import os
from copy import deepcopy

import pytest
import pytest_asyncio
from support.context import using_context
from support.helpers import get_pref, set_pref
from tests.support.classic.asserts import assert_success
from tests.support.sync import Poll
from webdriver.error import NoSuchWindowException

from .addon_install import install_addon
from .addon_uninstall import uninstall_addon

EXTENSION_NEW_TAB_XPI = os.path.join(
    os.path.abspath(os.path.dirname(__file__)),
    "..",
    "support",
    "webextensions",
    "extension_new_tab.xpi",
)


@pytest.fixture
def install_new_tab_extension(session):
    """Install an extension that opens a page on install, wait for the page
    to load, and return its moz-extension:// URL. Cleans up on teardown."""
    original_handles = session.handles

    with open(EXTENSION_NEW_TAB_XPI, "rb") as f:
        xpi_base64 = base64.b64encode(f.read()).decode("utf-8")

    response = install_addon(session, "addon", xpi_base64, True)
    addon_id = assert_success(response)

    original_handle = session.window_handle

    def find_extension_tab(_):
        for handle in session.handles:
            if handle in original_handles:
                continue

            session.window_handle = handle
            url = session.url

            if url.startswith("moz-extension://"):
                return handle, url

        return False

    # Bug 2051944 - On Android the extension's page might be loaded
    # with a delay, causing the retrieval of the URL to fail due to
    # a non-existent currentWindowGlobal.
    wait = Poll(session, timeout=5, ignored_exceptions=NoSuchWindowException)
    ext_handle, ext_url = wait.until(find_extension_tab)

    session.window_handle = original_handle

    yield ext_handle, ext_url

    uninstall_addon(session, addon_id)


@pytest_asyncio.fixture
async def parent_process_session(configuration, geckodriver):
    """Start a new geckodriver session with about:about opened via command
    line argument and return the session. Stops the driver on teardown."""
    config = deepcopy(configuration)
    config["capabilities"]["moz:firefoxOptions"]["args"].append("about:about")
    config["capabilities"]["moz:firefoxOptions"]["androidIntentArguments"] = [
        "-d",
        "about:about",
    ]

    driver = geckodriver(config=config, force_new=True)
    driver.new_session()

    assert driver.session.url == "about:about"

    yield driver.session

    await driver.stop()


@pytest.fixture
def set_full_zoom(session):
    """Sets the full zoom value for the currently selected tab."""

    def _set_full_zoom(value):
        handle = session.window_handle

        with using_context(session, "chrome"):
            session.execute_script(
                """
                const { NavigableManager } = ChromeUtils.importESModule(
                    "chrome://remote/content/shared/NavigableManager.sys.mjs"
                );

                const [navigableId, value] = arguments;

                const context = NavigableManager.getBrowsingContextById(navigableId);
                if (context === null) {
                    throw new Error(`Browsing Context with id ${navigableId} not found`);
                }

                context.fullZoom = value;
                """,
                args=[handle, value],
            )

        return session.execute_script("return window.devicePixelRatio")

    return _set_full_zoom


@pytest.fixture
def use_pref(session):
    """Set a specific pref value."""
    reset_values = {}

    def _use_pref(pref, value):
        if pref not in reset_values:
            reset_values[pref] = get_pref(session, pref)

        set_pref(session, pref, value)

    yield _use_pref

    for pref, reset_value in reset_values.items():
        set_pref(session, pref, reset_value)
