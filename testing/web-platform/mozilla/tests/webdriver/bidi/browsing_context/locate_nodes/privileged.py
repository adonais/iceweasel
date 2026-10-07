from copy import deepcopy

import pytest
from tests.bidi import any_string, recursive_compare
from webdriver.bidi.error import UnsupportedOperationException

pytestmark = pytest.mark.asyncio


@pytest.mark.geckodriver(allow_system_access=True)
async def test_locate_in_chrome_window(
    bidi_session, default_chrome_handler, new_chrome_window
):
    # Bug 1762066: Skip this test on Android, as it currently causes the browser to crash
    # when attempting to register a chrome handler for files that cannot be found.
    # Since we cannot disable the test via the manifest, we return early instead.
    if bidi_session.capabilities["platformName"] == "android":
        return

    chrome_url = f"{default_chrome_handler}test.xhtml"
    new_window = new_chrome_window(chrome_url)

    nodes = await bidi_session.browsing_context.locate_nodes(
        context=new_window.id, locator={"type": "css", "value": "iframe"}
    )
    assert len(nodes) == 2

    expected = {
        "type": "node",
        "sharedId": any_string,
        "value": {
            "attributes": {
                "id": "iframe",
                "src": "chrome://marionette-chrome/content/test_iframe.xhtml",
            },
            "childNodeCount": 0,
            "localName": "iframe",
            "namespaceURI": "http://www.w3.org/1999/xhtml",
            "nodeType": 1,
        },
    }
    recursive_compare(expected, nodes[0])


async def test_locate_in_parent_process_context(parent_process_context):
    bidi_session, context_id = parent_process_context

    with pytest.raises(UnsupportedOperationException):
        await bidi_session.browsing_context.locate_nodes(
            context=context_id, locator={"type": "css", "value": "iframe"}
        )


async def test_locate_in_privilegedabout_context(configuration, geckodriver):
    # Runs in a "privilegedabout" process with a content principal.
    url = "about:certificate"

    config = deepcopy(configuration)
    config["capabilities"]["moz:firefoxOptions"]["args"].append(url)
    config["capabilities"]["moz:firefoxOptions"]["androidIntentArguments"] = [
        "-d",
        url,
    ]
    config["capabilities"]["webSocketUrl"] = True

    driver = geckodriver(config=config, force_new=True)

    try:
        driver.new_session()

        bidi_session = driver.session.bidi_session
        await bidi_session.start()

        contexts = await bidi_session.browsing_context.get_tree(max_depth=0)
        page_context = next((ctx for ctx in contexts if ctx["url"] == url), None)
        assert page_context is not None, f"No context found with URL {url}"

        with pytest.raises(UnsupportedOperationException):
            await bidi_session.browsing_context.locate_nodes(
                context=page_context["context"],
                locator={"type": "css", "value": "iframe"},
            )
    finally:
        await driver.stop()
