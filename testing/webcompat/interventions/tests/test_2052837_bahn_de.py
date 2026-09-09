import pytest

URL = "https://bahn.de/info/login"

HERO_CSS = "#kc-page-title"


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_regression(client):
    await client.navigate(URL, wait="none")
    assert client.await_css(HERO_CSS, is_displayed=True)
