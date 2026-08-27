# META: timeout=long

import tempfile
from copy import deepcopy
from pathlib import Path

import pytest
from support.context import using_context
from tests.classic.execute_script import execute_script
from tests.support.classic.asserts import assert_error, assert_success

pytestmark = pytest.mark.asyncio


async def test_execute_script_parent_process_context(parent_process_session):
    response = execute_script(parent_process_session, "return 1 + 1")
    assert_error(response, "unsupported operation")


async def test_execute_script_privilegedabout_context(configuration, geckodriver):
    # Runs in a "privilegedabout" process with a content principal.
    url = "about:certificate"

    config = deepcopy(configuration)
    config["capabilities"]["moz:firefoxOptions"]["args"].append(url)
    config["capabilities"]["moz:firefoxOptions"]["androidIntentArguments"] = [
        "-d",
        url,
    ]

    driver = geckodriver(config=config, force_new=True)
    driver.new_session()

    assert driver.session.url == url

    response = execute_script(driver.session, "return 1 + 1")
    assert_error(response, "unsupported operation")


def test_execute_script_file_url_context(session):
    # Bug 2040913: Reduce page load timeout to prevent hangs on Android
    session.timeouts.page_load = 3

    with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as f:
        f.write(b"<p>test</p>")
        file_url = Path(f.name).as_uri()

    session.url = file_url

    response = execute_script(session, "return 1 + 1")
    assert_success(response, 2)


@pytest.mark.geckodriver(allow_system_access=True)
@pytest.mark.parametrize(
    "expression, expected_value",
    [
        ("ChromeUtils.getClassName(document.defaultView)", "Window"),
        ("Ci.nsICookie.SAMESITE_STRICT", 2),
    ],
    ids=["chrome-utils", "interface"],
)
def test_execute_script_chrome_context_with_system_access(
    session, expression, expected_value
):
    with using_context(session, "chrome"):
        response = execute_script(session, f"return {expression}")
        assert_success(response, expected_value)


@pytest.mark.geckodriver(allow_system_access=True)
def test_execute_script_parent_process_context_with_system_access(session):
    session.url = "about:about"

    response = execute_script(session, "return 1 + 1")
    assert_success(response, 2)


@pytest.mark.geckodriver(allow_system_access=True)
def test_execute_script_privilegedabout_context_with_system_access(session):
    session.url = "about:certificate"

    response = execute_script(session, "return 1 + 1")
    assert_success(response, 2)
