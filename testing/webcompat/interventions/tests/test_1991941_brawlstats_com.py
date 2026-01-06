import pytest

URL = "https://brawlstats.com/"
DESKTOP_CSS = "#app.isDesktop"
MOBILE_CSS = "#app.isMobile"


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_regression(client):
    await client.navigate(URL)
    assert client.await_css(MOBILE_CSS, is_displayed=True)
    assert not client.find_css(DESKTOP_CSS, is_displayed=True)
