# META: timeout=long

import pytest
from webdriver.bidi.error import UnsupportedOperationException

pytestmark = pytest.mark.asyncio

ABOUT_URL = "about:about"


# To minimize Firefox restarts, run tests requiring system access first,
# followed by those that don't; so only one restart is needed.


@pytest.mark.geckodriver(allow_system_access=True)
async def test_reload_about_url_with_system_access(bidi_session, new_tab):
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=ABOUT_URL, wait="complete"
    )

    contexts = await bidi_session.browsing_context.get_tree(
        root=new_tab["context"], max_depth=0
    )
    assert contexts[0]["url"] == ABOUT_URL

    await bidi_session.browsing_context.reload(
        context=new_tab["context"], wait="complete"
    )

    contexts = await bidi_session.browsing_context.get_tree(
        root=new_tab["context"], max_depth=0
    )
    assert contexts[0]["url"] == ABOUT_URL


@pytest.mark.geckodriver(allow_system_access=True)
async def test_reload_moz_extension_url_with_system_access(
    bidi_session, install_new_tab_extension
):
    context_id, ext_url = install_new_tab_extension

    await bidi_session.browsing_context.reload(context=context_id, wait="complete")

    contexts = await bidi_session.browsing_context.get_tree(
        root=context_id, max_depth=0
    )
    assert contexts[0]["url"] == ext_url


async def test_reload_about_url_without_system_access(parent_process_context):
    bidi_session, context_id = parent_process_context

    with pytest.raises(UnsupportedOperationException):
        await bidi_session.browsing_context.reload(context=context_id, wait="complete")


async def test_reload_moz_extension_url_without_system_access(
    bidi_session, install_new_tab_extension
):
    context_id, _ = install_new_tab_extension

    with pytest.raises(UnsupportedOperationException):
        await bidi_session.browsing_context.reload(context=context_id, wait="complete")
