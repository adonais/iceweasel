import pytest

URL = "https://kickasstorrents.cr"

SUPPORTED_CSS = "#wrapper"
UNSUPPORTED_CSS = "body:empty"


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_regression(client):
    await client.navigate(URL, wait="none")
    assert client.await_css(SUPPORTED_CSS, is_displayed=True)
    assert not client.find_css(UNSUPPORTED_CSS, is_displayed=True)
