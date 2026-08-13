import pytest

URL = "https://deadpixeltest.org/fixer"
POPUP_CSS = "#popup"


async def is_popup_centered(client, platform):
    await client.navigate(URL, wait="none")
    return client.execute_script(
        """
            const bounds = arguments[0].getBoundingClientRect();
            const windowHeight = arguments[1] == "android" ? window.outerHeight : window.innerHeight;
            const is_correct_left = Math.abs(bounds.x - Math.max(0, (window.outerWidth / 2) - (bounds.width / 2))) < 2;
            const is_correct_top = Math.abs(bounds.y - Math.max(0, (windowHeight / 2) - (bounds.height / 2))) < 2;
            console.error(is_correct_left, is_correct_top);
            return is_correct_left && is_correct_top;
        """,
        client.await_css(POPUP_CSS, is_displayed=True),
        platform,
    )


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client, platform):
    assert await is_popup_centered(client, platform)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client, platform):
    assert not await is_popup_centered(client, platform)
