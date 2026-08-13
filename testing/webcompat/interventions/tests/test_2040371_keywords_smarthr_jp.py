import pytest

URL = "https://keywords.smarthr.jp/login"

HERO_CSS = "#reactRoot"
UNSUPPORTED_CSS = "#system-requirements-alert"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL, wait="none")
    assert client.await_css(HERO_CSS, is_displayed=True)
    await client.stall(2)
    return not client.find_css(UNSUPPORTED_CSS)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL, wait="none")
    assert client.await_css(UNSUPPORTED_CSS, is_displayed=True)
