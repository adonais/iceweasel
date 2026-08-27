import pytest

URL = "https://www.neopets.com/explore.phtml"
CONTENT_CSS = ".contentModule"
LOGIN_CSS = "a[href='/login/']"


async def is_screen_too_wide(client):
    await client.navigate(URL)
    await client.stall(3)
    return client.execute_script(
        """
        return arguments[0].getBoundingClientRect().left > arguments[1].getBoundingClientRect().right
	    """,
        client.await_css(LOGIN_CSS, is_displayed=True),
        client.await_css(CONTENT_CSS, is_displayed=True),
    )


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert not await is_screen_too_wide(client)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert await is_screen_too_wide(client)
