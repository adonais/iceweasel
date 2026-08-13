import pytest
from webdriver.bidi.modules.script import ContextTarget

pytestmark = pytest.mark.asyncio


async def assert_tab_order(bidi_session, chrome_context, expected_context_ids):
    """Assert the order of top level browsing contexts.

    The window used for the assertion is inferred from the first context id of
    expected_context_ids.
    """
    result = await bidi_session.script.call_function(
        function_declaration="""contextId => {
            const { NavigableManager } =
                ChromeUtils.importESModule("chrome://remote/content/shared/NavigableManager.sys.mjs");
            const { TabManager } =
                ChromeUtils.importESModule("chrome://remote/content/shared/TabManager.sys.mjs");

            const browsingContext = NavigableManager.getBrowsingContextById(contextId);
            const chromeWindow = browsingContext.top.embedderWindowGlobal.browsingContext.window;
            const tabBrowser = TabManager.getTabBrowser(chromeWindow);
            return tabBrowser.browsers.map(browser => NavigableManager.getIdForBrowser(browser));
        }""",
        arguments=[{"type": "string", "value": expected_context_ids[0]}],
        target=ContextTarget(chrome_context["context"]),
        await_promise=False,
    )

    context_ids = [item["value"] for item in result["value"]]
    assert context_ids == expected_context_ids


@pytest.mark.geckodriver(allow_system_access=True)
async def test_reference_context(bidi_session):
    parent_contexts = await bidi_session.browsing_context.get_tree(
        max_depth=0, _extension_params={"moz:scope": "chrome"}
    )
    chrome_context = parent_contexts[0]

    # Create a new window with a tab tab1
    result = await bidi_session.browsing_context.create(type_hint="window")
    tab1_context_id = result["context"]

    # Create a second window with a tab tab2
    result = await bidi_session.browsing_context.create(type_hint="window")
    tab2_context_id = result["context"]

    # Create a new tab tab3 next to tab1
    result = await bidi_session.browsing_context.create(
        type_hint="tab", reference_context=tab1_context_id
    )
    tab3_context_id = result["context"]

    # Create a new tab tab4 next to tab2
    result = await bidi_session.browsing_context.create(
        type_hint="tab", reference_context=tab2_context_id
    )
    tab4_context_id = result["context"]

    # Create a new tab tab5 also next to tab2 (should consequently be between
    # tab2 and tab4)
    result = await bidi_session.browsing_context.create(
        type_hint="tab", reference_context=tab2_context_id
    )
    tab5_context_id = result["context"]

    # Create a new window, but pass a reference_context from an existing window.
    # The reference context is expected to be ignored here.
    result = await bidi_session.browsing_context.create(
        type_hint="window", reference_context=tab2_context_id
    )
    tab6_context_id = result["context"]

    # We expect 3 windows in total, with a specific tab order:
    # - the first window should contain tab1, tab3
    await assert_tab_order(
        bidi_session, chrome_context, [tab1_context_id, tab3_context_id]
    )
    # - the second window should contain tab2, tab5, tab4
    await assert_tab_order(
        bidi_session,
        chrome_context,
        [tab2_context_id, tab5_context_id, tab4_context_id],
    )
    # - the third window should contain tab6
    await assert_tab_order(bidi_session, chrome_context, [tab6_context_id])
