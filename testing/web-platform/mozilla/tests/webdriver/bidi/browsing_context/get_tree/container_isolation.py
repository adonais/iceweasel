import pytest
from webdriver.bidi.error import NoSuchFrameException, UnsupportedOperationException

from bidi.support.container_isolation import container_isolation

pytestmark = [pytest.mark.asyncio, container_isolation]


async def test_only_contexts_of_the_container(
    bidi_session, new_tab, session_user_context, tab_outside_container
):
    contexts = await bidi_session.browsing_context.get_tree(max_depth=0)

    context_ids = [context["context"] for context in contexts]
    assert new_tab["context"] in context_ids
    assert tab_outside_container not in context_ids

    for context in contexts:
        assert context["userContext"] == session_user_context


async def test_root(bidi_session, new_tab):
    contexts = await bidi_session.browsing_context.get_tree(
        root=new_tab["context"], max_depth=0
    )
    assert len(contexts) == 1
    assert new_tab["context"] == contexts[0]["context"]


async def test_root_outside_container(bidi_session, tab_outside_container):
    with pytest.raises(NoSuchFrameException):
        await bidi_session.browsing_context.get_tree(root=tab_outside_container)


@pytest.mark.geckodriver(allow_system_access=True)
async def test_chrome_scope(bidi_session):
    with pytest.raises(UnsupportedOperationException):
        await bidi_session.browsing_context.get_tree(
            _extension_params={"moz:scope": "chrome"}
        )
