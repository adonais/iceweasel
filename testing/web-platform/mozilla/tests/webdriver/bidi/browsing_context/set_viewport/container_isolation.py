import pytest
from webdriver.bidi.error import NoSuchFrameException, NoSuchUserContextException

from bidi.support.container_isolation import container_isolation

pytestmark = [pytest.mark.asyncio, container_isolation]


async def test_user_contexts(bidi_session, session_user_context):
    await bidi_session.browsing_context.set_viewport(
        user_contexts=[session_user_context], viewport=None
    )


async def test_user_contexts_outside_container(bidi_session):
    with pytest.raises(NoSuchUserContextException):
        await bidi_session.browsing_context.set_viewport(
            user_contexts=["default"], viewport=None
        )


async def test_context(bidi_session, new_tab):
    await bidi_session.browsing_context.set_viewport(
        context=new_tab["context"], viewport=None
    )


async def test_context_outside_container(bidi_session, tab_outside_container):
    with pytest.raises(NoSuchFrameException):
        await bidi_session.browsing_context.set_viewport(
            context=tab_outside_container, viewport=None
        )
