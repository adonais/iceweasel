import pytest

URL = "https://kuruma-news.jp/"
DESKTOP_CSS = "#home-latest"
MOBILE_CSS = "#home-img-slider"


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_regression(client):
    await client.navigate(URL, wait="none")
    assert client.await_css(MOBILE_CSS, is_displayed=True)
    assert not client.find_css(DESKTOP_CSS, is_displayed=True)
