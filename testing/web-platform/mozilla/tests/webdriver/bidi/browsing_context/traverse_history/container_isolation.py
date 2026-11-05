import pytest
from webdriver.bidi.error import NoSuchFrameException

from bidi.support.container_isolation import container_isolation

pytestmark = [pytest.mark.asyncio, container_isolation]


async def test_context(bidi_session, new_tab, inline):
    for page in ["foo", "bar"]:
        await bidi_session.browsing_context.navigate(
            context=new_tab["context"], url=inline(page), wait="complete"
        )

    await bidi_session.browsing_context.traverse_history(
        context=new_tab["context"], delta=-1
    )


async def test_context_outside_container(bidi_session, tab_outside_container):
    with pytest.raises(NoSuchFrameException):
        await bidi_session.browsing_context.traverse_history(
            context=tab_outside_container, delta=-1
        )
