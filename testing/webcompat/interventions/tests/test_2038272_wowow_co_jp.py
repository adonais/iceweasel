import pytest

URL = "https://www.wowow.co.jp/"
SEARCH_CSS = "header .__localsearch"


async def search_is_fully_offscreen(client):
    await client.navigate(URL, wait="none")
    return client.execute_script(
        """
        const search = arguments[0];
        return search.getBoundingClientRect().right > window.innerWidth;
    """,
        client.await_css(SEARCH_CSS, is_displayed=True),
    )


@pytest.mark.enable_webkit_scrollbar
@pytest.mark.skip_platforms("android")
@pytest.mark.need_visible_scrollbars
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert not await search_is_fully_offscreen(client)


@pytest.mark.disable_webkit_scrollbar
@pytest.mark.skip_platforms("android")
@pytest.mark.need_visible_scrollbars
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert await search_is_fully_offscreen(client)
