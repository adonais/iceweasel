import pytest

URL = "https://my.younify.tv/services/"
SUPPORTED_TEXT = "Your session has expired"
UNSUPPORTED_TEXT = "Browser not supported"
MOBILE_TEXT = "Open this page on a computer"


@pytest.mark.only_platforms("desktop")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL, wait="none")
    assert client.await_text(SUPPORTED_TEXT, is_displayed=True)
    assert not client.find_text(UNSUPPORTED_TEXT, is_displayed=True)


@pytest.mark.only_platforms("desktop")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL, wait="none")
    assert client.await_text(UNSUPPORTED_TEXT, is_displayed=True)
    assert not client.find_text(SUPPORTED_TEXT, is_displayed=True)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_mobile_still_unsupported(client):
    await client.navigate(URL, wait="none")
    assert client.await_text(MOBILE_TEXT, is_displayed=True)
    assert not client.find_text(SUPPORTED_TEXT, is_displayed=True)
