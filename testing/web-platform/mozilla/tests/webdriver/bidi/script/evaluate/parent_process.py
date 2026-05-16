import pytest
from webdriver.bidi.error import UnsupportedOperationException
from webdriver.bidi.modules.script import ContextTarget

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize("url", ["about:memory", "about:networking"])
async def test_evaluate_parent_process_context(bidi_session, new_tab, url):
    # Bug 1579790: might make it impossible to navigate to those pages without
    # allow_system_access, we will nee to find an alternative way to open those
    # pages.
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=url, wait="complete"
    )

    with pytest.raises(UnsupportedOperationException):
        await bidi_session.script.evaluate(
            expression="1 + 1",
            target=ContextTarget(new_tab["context"]),
            await_promise=False,
        )


@pytest.mark.allow_system_access
@pytest.mark.parametrize("url", ["about:memory", "about:networking"])
async def test_evaluate_parent_process_context_with_system_access(
    bidi_session, new_tab, url
):
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=url, wait="complete"
    )

    result = await bidi_session.script.evaluate(
        expression="1 + 1",
        target=ContextTarget(new_tab["context"]),
        await_promise=False,
    )

    assert result == {"type": "number", "value": 2}


async def test_evaluate_content_process_context(bidi_session, new_tab):
    # about:certificate runs in the content process and should not block
    # script evaluation.
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url="about:certificate", wait="complete"
    )

    result = await bidi_session.script.evaluate(
        expression="1 + 1",
        target=ContextTarget(new_tab["context"]),
        await_promise=False,
    )

    assert result == {"type": "number", "value": 2}
