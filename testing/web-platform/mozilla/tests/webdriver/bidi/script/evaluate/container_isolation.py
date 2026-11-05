import pytest
from webdriver.bidi.error import NoSuchFrameException
from webdriver.bidi.modules.script import ContextTarget

from bidi.support.container_isolation import container_isolation

pytestmark = [pytest.mark.asyncio, container_isolation]


async def test_context(bidi_session, new_tab):
    result = await bidi_session.script.evaluate(
        expression="1 + 2",
        target=ContextTarget(new_tab["context"]),
        await_promise=False,
    )
    assert result == {"type": "number", "value": 3}


async def test_context_outside_container(bidi_session, tab_outside_container):
    with pytest.raises(NoSuchFrameException):
        await bidi_session.script.evaluate(
            expression="1 + 2",
            target=ContextTarget(tab_outside_container),
            await_promise=False,
        )
