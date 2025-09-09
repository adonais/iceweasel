import pytest

URL = "https://e.seb.lt/ib/login"

COOKIES_CSS = "#content-cookie"
UNSUPPORTED_TEXT = "Google Chrome"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL)
    client.click(client.await_css(COOKIES_CSS, is_displayed=True))
    await client.stall(3)
    assert not client.find_text(UNSUPPORTED_TEXT, is_displayed=True)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL)
    client.click(client.await_css(COOKIES_CSS, is_displayed=True))
    assert client.await_text(UNSUPPORTED_TEXT, is_displayed=True)
