import pytest
from webdriver.bidi.error import NoSuchFrameException

from bidi.support.container_isolation import container_isolation

pytestmark = [pytest.mark.asyncio, container_isolation]


async def test_context(bidi_session, new_tab):
    await bidi_session.browsing_context.reload(
        context=new_tab["context"], wait="complete"
    )


async def test_context_outside_container(bidi_session, tab_outside_container):
    with pytest.raises(NoSuchFrameException):
        await bidi_session.browsing_context.reload(
            context=tab_outside_container, wait="complete"
        )
