from copy import deepcopy

import pytest
from tests.classic.execute_script import execute_script
from tests.support.classic.asserts import assert_error, assert_success

pytestmark = pytest.mark.asyncio


async def test_execute_script_parent_process_context(configuration, geckodriver):
    # Bug 2038624 will make it impossible to navigate to those pages without
    # allow_system_access, we will need to find an alternative way to open
    # those pages.
    config = deepcopy(configuration)
    config["capabilities"]["moz:firefoxOptions"]["args"].append("about:about")
    config["capabilities"]["moz:firefoxOptions"]["androidIntentArguments"] = [
        "-d",
        "about:about",
    ]

    driver = geckodriver(config=config)
    driver.new_session()

    assert driver.session.url == "about:about"

    response = execute_script(driver.session, "return 1 + 1")
    assert_error(response, "unsupported operation")


@pytest.mark.geckodriver(allow_system_access=True)
def test_execute_script_parent_process_context_with_system_access(session):
    session.url = "about:about"

    response = execute_script(session, "return 1 + 1")
    assert_success(response, 2)
