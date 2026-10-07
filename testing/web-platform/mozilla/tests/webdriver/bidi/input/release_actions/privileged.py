from copy import deepcopy

import pytest
from webdriver.bidi.error import UnsupportedOperationException
from webdriver.bidi.modules.input import Actions
from webdriver.bidi.modules.script import ContextTarget

pytestmark = pytest.mark.asyncio


@pytest.mark.geckodriver(allow_system_access=True)
async def test_release_actions_chrome_window_with_system_access(
    bidi_session, default_chrome_handler, new_chrome_window
):
    # Bug 1762066: Skip this test on Android, as it currently causes the browser to crash
    # when attempting to register a chrome handler for files that cannot be found.
    # Since we cannot disable the test via the manifest, we return early instead.
    if bidi_session.capabilities["platformName"] == "android":
        return

    chrome_url = f"{default_chrome_handler}test.xhtml"
    new_window = new_chrome_window(chrome_url)
    chrome_context = {"context": new_window.id}

    await bidi_session.script.call_function(
        function_declaration="""() => {{
            window.allEvents = [];
            document.addEventListener("keydown", ev => allEvents.push("keydown " + ev.key));
            document.addEventListener("keyup", ev => allEvents.push("keyup " + ev.key));
        }}
        """,
        target=ContextTarget(chrome_context["context"]),
        await_promise=False,
    )

    actions = Actions()
    (actions.add_key().key_down("a"))

    await bidi_session.input.perform_actions(
        actions=actions, context=chrome_context["context"]
    )
    await bidi_session.input.release_actions(context=chrome_context["context"])

    result = await bidi_session.script.evaluate(
        expression="JSON.stringify(allEvents)",
        target=ContextTarget(chrome_context["context"]),
        await_promise=False,
    )
    assert result["value"] == '["keydown a","keyup a"]'


async def test_release_actions_parent_process_context(parent_process_context):
    bidi_session, context_id = parent_process_context

    with pytest.raises(UnsupportedOperationException):
        await bidi_session.input.release_actions(context=context_id)


async def test_release_actions_privilegedabout_context(configuration, geckodriver):
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
            await bidi_session.input.release_actions(context=page_context["context"])
    finally:
        await driver.stop()
