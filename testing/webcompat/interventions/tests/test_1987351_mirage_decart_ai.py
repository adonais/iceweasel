import pytest

URL = "https://mirage.decart.ai/terms-of-service"

SUPPORTED_TEXT = "Terms of Service"
UNSUPPORTED_TEXT = "work properly in Firefox"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL)
    assert client.await_text(SUPPORTED_TEXT, is_displayed=True)
    assert not client.find_text(UNSUPPORTED_TEXT, is_displayed=True)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL)
    assert client.await_text(UNSUPPORTED_TEXT, is_displayed=True)
