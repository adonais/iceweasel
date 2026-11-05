import pytest
from bidi.support.container_isolation import container_isolation
from webdriver.bidi.error import NoSuchFrameException
from webdriver.bidi.modules.input import Actions

pytestmark = [pytest.mark.asyncio, container_isolation]


async def test_context(bidi_session, new_tab):
    actions = Actions()
    actions.add_key().key_down("a").key_up("a")

    await bidi_session.input.perform_actions(
        actions=actions, context=new_tab["context"]
    )


async def test_context_outside_container(bidi_session, tab_outside_container):
    actions = Actions()
    actions.add_key().key_down("a").key_up("a")

    with pytest.raises(NoSuchFrameException):
        await bidi_session.input.perform_actions(
            actions=actions, context=tab_outside_container
        )
