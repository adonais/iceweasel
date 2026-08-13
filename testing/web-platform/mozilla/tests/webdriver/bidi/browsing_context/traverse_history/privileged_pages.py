# META: timeout=long

import pytest
from webdriver.bidi.error import UnsupportedOperationException

pytestmark = pytest.mark.asyncio

ABOUT_URL = "about:about"


# To minimize Firefox restarts, run tests requiring system access first,
# followed by those that don't; so only one restart is needed.


@pytest.mark.geckodriver(allow_system_access=True)
async def test_traverse_back_to_about_url_with_system_access(
    bidi_session, new_tab, inline
):
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=ABOUT_URL, wait="complete"
    )

    page = inline("<p>content page")
    await bidi_session.browsing_context.navigate(
        context=new_tab["context"], url=page, wait="complete"
    )

    await bidi_session.browsing_context.traverse_history(
        context=new_tab["context"], delta=-1
    )

    contexts = await bidi_session.browsing_context.get_tree(
        root=new_tab["context"], max_depth=0
    )
    assert contexts[0]["url"] == ABOUT_URL


@pytest.mark.geckodriver(allow_system_access=True)
async def test_traverse_back_to_moz_extension_url_with_system_access(
    bidi_session, install_new_tab_extension, inline
):
    context_id, ext_url = install_new_tab_extension

    page = inline("<p>content page")
    await bidi_session.browsing_context.navigate(
        context=context_id, url=page, wait="complete"
    )

    await bidi_session.browsing_context.traverse_history(context=context_id, delta=-1)

    contexts = await bidi_session.browsing_context.get_tree(
        root=context_id, max_depth=0
    )
    assert contexts[0]["url"] == ext_url


async def test_traverse_back_to_about_url_without_system_access(
    parent_process_context, inline
):
    bidi_session, context_id = parent_process_context

    page = inline("<p>content page")
    await bidi_session.browsing_context.navigate(
        context=context_id, url=page, wait="complete"
    )

    with pytest.raises(UnsupportedOperationException):
        await bidi_session.browsing_context.traverse_history(
            context=context_id, delta=-1
        )


async def test_traverse_back_to_moz_extension_url_without_system_access(
    bidi_session, install_new_tab_extension, inline
):
    context_id, _ = install_new_tab_extension

    page = inline("<p>content page")
    await bidi_session.browsing_context.navigate(
        context=context_id, url=page, wait="complete"
    )

    with pytest.raises(UnsupportedOperationException):
        await bidi_session.browsing_context.traverse_history(
            context=context_id, delta=-1
        )
