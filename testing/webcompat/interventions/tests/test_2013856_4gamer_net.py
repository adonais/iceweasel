import pytest

URL = "https://www.4gamer.net/games/991/G999108/20251216016/"


async def content_fits_screen_width(client):
    await client.navigate(URL)
    return client.execute_script(
        "return document.documentElement.getBoxQuads()[0].p2.x >= window.innerWidth"
    )


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_regression(client):
    assert await content_fits_screen_width(client)
