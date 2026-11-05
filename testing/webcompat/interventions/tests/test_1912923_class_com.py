import pytest

LIVELESSON_URL = (
    "https://livelesson.class.com/class/8a731bd4-17f2-4bf6-a1b4-4f3561cab2bd"
)
LIVELESSON_SUPPORTED_TEXT = "Join your class session"

PEGASO_URL = "https://pegaso.class.com/ics/meeting/"
PEGASO_SUPPORTED_TEXT = "The page you are accessing was not found"

UNSUPPORTED_TEXT = "This browser is not supported"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(LIVELESSON_URL)
    client.await_text(LIVELESSON_SUPPORTED_TEXT, is_displayed=True)
    assert not client.find_text(UNSUPPORTED_TEXT, is_displayed=True)
    await client.navigate(PEGASO_URL)
    client.await_text(PEGASO_SUPPORTED_TEXT, is_displayed=True)
    assert not client.find_text(UNSUPPORTED_TEXT, is_displayed=True)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(LIVELESSON_URL)
    client.await_text(UNSUPPORTED_TEXT, is_displayed=True)
    assert not client.find_text(LIVELESSON_SUPPORTED_TEXT, is_displayed=True)
    await client.navigate(PEGASO_URL)
    client.await_text(UNSUPPORTED_TEXT, is_displayed=True)
    assert not client.find_text(PEGASO_SUPPORTED_TEXT, is_displayed=True)
