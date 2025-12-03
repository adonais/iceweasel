import pytest

URL = "https://sakti.kemenkeu.go.id/"
SUPPORTED_CSS = "input[name=username]"
ERROR_MSG = "Zone.js has detected that ZoneAwarePromise"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL, wait="none", timeout=30)
    assert client.await_css(SUPPORTED_CSS, is_displayed=True)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL, await_console_message=ERROR_MSG)
