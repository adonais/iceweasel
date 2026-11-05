import pytest
from webdriver.bidi.error import NoSuchFrameException

from bidi.support.container_isolation import container_isolation

pytestmark = [pytest.mark.asyncio, container_isolation]


async def test_context(bidi_session, new_tab, inline):
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=inline("foo"), wait="complete"
    )


async def test_context_outside_container(bidi_session, inline, tab_outside_container):
    with pytest.raises(NoSuchFrameException):
        await bidi_session.browsing_context.navigate(
            context=tab_outside_container, url=inline("foo"), wait="complete"
        )
