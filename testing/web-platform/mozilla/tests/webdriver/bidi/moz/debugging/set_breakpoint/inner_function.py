import pytest

pytestmark = pytest.mark.asyncio

from .. import PAUSED_EVENT, RESUMED_EVENT

# inline() generates:
# Line 1: <!doctype html>
# Line 2: <meta charset=UTF-8>
# Line 3: <script>
# Line 4: function foo() {
# Line 5:     const x = 42;
# Line 6:     return x;
INNER_FUNCTION_DOC = """<script>
function foo() {
    const x = 42;
    return x;
}
</script>"""


async def test_set_breakpoint_before_navigation(
    bidi_session,
    new_tab,
    enable_debugging,
    inline,
    subscribe_events,
    assert_pause_and_resume,
    set_breakpoint,
):
    await subscribe_events([PAUSED_EVENT, RESUMED_EVENT])

    await enable_debugging(contexts=[new_tab["context"]])

    url = inline(INNER_FUNCTION_DOC)

    # Set a breakpoint in foo(), child script of the top level inline script.
    await set_breakpoint(location={"url": url, "line": 6})

    # Navigate to the page which matches our breakpoint. The breakpoint in
    # function should be set.
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=url, wait="complete"
    )

    result = await assert_pause_and_resume(new_tab, expression="foo()", line=6)
    assert result["type"] == "number"
    assert result["value"] == 42


async def test_set_breakpoint_after_reload(
    bidi_session,
    new_tab,
    enable_debugging,
    inline,
    subscribe_events,
    assert_pause_and_resume,
    set_breakpoint,
):
    await subscribe_events([PAUSED_EVENT, RESUMED_EVENT])

    await enable_debugging(contexts=[new_tab["context"]])

    url = inline(INNER_FUNCTION_DOC)

    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=url, wait="complete"
    )

    # Set a breakpoint in foo(), child script of the top level inline script.
    await set_breakpoint(location={"url": url, "line": 6})

    # Reload. The breakpoint in function should be reapplied.
    await bidi_session.browsing_context.reload(
        context=new_tab["context"], wait="complete"
    )

    result = await assert_pause_and_resume(new_tab, expression="foo()", line=6)
    assert result["type"] == "number"
    assert result["value"] == 42
