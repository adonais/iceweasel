import pytest
from webdriver.bidi.error import NoSuchFrameException, NoSuchUserContextException

from bidi.support.container_isolation import container_isolation

pytestmark = [pytest.mark.asyncio, container_isolation]


async def test_default_user_context(bidi_session, session_user_context):
    result = await bidi_session.browsing_context.create(type_hint="tab")

    assert result["userContext"] == session_user_context

    await bidi_session.browsing_context.close(context=result["context"])


async def test_user_context(bidi_session, session_user_context):
    result = await bidi_session.browsing_context.create(
        type_hint="tab", user_context=session_user_context
    )

    assert result["userContext"] == session_user_context

    await bidi_session.browsing_context.close(context=result["context"])


async def test_user_context_outside_container(bidi_session):
    with pytest.raises(NoSuchUserContextException):
        await bidi_session.browsing_context.create(
            type_hint="tab", user_context="default"
        )


async def test_reference_context(bidi_session, new_tab, session_user_context):
    result = await bidi_session.browsing_context.create(
        type_hint="tab", reference_context=new_tab["context"]
    )

    assert result["userContext"] == session_user_context

    await bidi_session.browsing_context.close(context=result["context"])


async def test_reference_context_outside_container(bidi_session, tab_outside_container):
    with pytest.raises(NoSuchFrameException):
        await bidi_session.browsing_context.create(
            type_hint="tab", reference_context=tab_outside_container
        )
