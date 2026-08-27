import pytest

URL = "https://gofilee.com/"
UNSUPPORTED_CSS = "#adblock-guard-root"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL)
    client.stall(5)
    assert not client.find_css(UNSUPPORTED_CSS, is_displayed=True)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL, wait="none")
    assert client.await_css(UNSUPPORTED_CSS, is_displayed=True)
