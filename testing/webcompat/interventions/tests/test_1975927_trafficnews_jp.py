import pytest

URL = "https://trafficnews.jp/"
DESKTOP_CSS = "#pickup-slider"
MOBILE_CSS = "#main-column"


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_regression(client):
    await client.navigate(URL, wait="none")
    assert client.await_css(MOBILE_CSS, is_displayed=True)
    assert not client.find_css(DESKTOP_CSS, is_displayed=True)
