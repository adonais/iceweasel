# META: timeout=long

import tempfile
from copy import deepcopy
from pathlib import Path

import pytest
from webdriver.bidi.error import UnsupportedOperationException
from webdriver.bidi.modules.script import ContextTarget

pytestmark = pytest.mark.asyncio


async def test_call_function_parent_process_context(parent_process_context):
    bidi_session, context_id = parent_process_context

    with pytest.raises(UnsupportedOperationException):
        await bidi_session.script.call_function(
            function_declaration="() => 1 + 1",
            target=ContextTarget(context_id),
            await_promise=False,
        )


async def test_call_function_privilegedabout_context(configuration, geckodriver):
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
            await bidi_session.script.call_function(
                function_declaration="() => 1 + 1",
                target=ContextTarget(page_context["context"]),
                await_promise=False,
            )
    finally:
        await driver.stop()


async def test_call_function_file_url_context(bidi_session, new_tab):
    with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as f:
        f.write(b"<p>test</p>")
        file_url = Path(f.name).as_uri()

    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=file_url, wait="complete"
    )

    result = await bidi_session.script.call_function(
        function_declaration="() => 1 + 1",
        target=ContextTarget(new_tab["context"]),
        await_promise=False,
    )

    assert result == {"type": "number", "value": 2}


@pytest.mark.geckodriver(allow_system_access=True)
@pytest.mark.parametrize(
    "function_declaration, expected_value",
    [
        (
            "() => ChromeUtils.getClassName(document.defaultView)",
            {"type": "string", "value": "Window"},
        ),
        (
            "() => Ci.nsICookie.SAMESITE_STRICT",
            {"type": "number", "value": 2},
        ),
    ],
    ids=["chrome-utils", "interface"],
)
async def test_call_function_chrome_context_with_system_access(
    bidi_session, chrome_context, function_declaration, expected_value
):
    result = await bidi_session.script.call_function(
        function_declaration=function_declaration,
        await_promise=False,
        target=ContextTarget(chrome_context["context"]),
    )

    assert result == expected_value


@pytest.mark.geckodriver(allow_system_access=True)
async def test_call_function_parent_process_context_with_system_access(
    bidi_session, new_tab
):
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url="about:about", wait="complete"
    )

    result = await bidi_session.script.call_function(
        function_declaration="() => 1 + 1",
        target=ContextTarget(new_tab["context"]),
        await_promise=False,
    )

    assert result == {"type": "number", "value": 2}


@pytest.mark.geckodriver(allow_system_access=True)
async def test_call_function_privilegedabout_context_with_system_access(
    bidi_session, new_tab
):
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url="about:certificate", wait="complete"
    )

    result = await bidi_session.script.call_function(
        function_declaration="() => 1 + 1",
        target=ContextTarget(new_tab["context"]),
        await_promise=False,
    )

    assert result == {"type": "number", "value": 2}
