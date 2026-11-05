import pytest

URL = "https://www.acionafacil.com.br/"

UNSUPPORTED_ALERT = "Google Chrome"
LOGIN_CSS = "#txtCodPrestador"
VPN_TEXT = "Access Denied"
VPN_MESSAGE = "Please try again using a VPN set to Brazil."


async def visit_site(client):
    await client.navigate(URL, wait="none")
    client.await_css("body", is_displayed=True)
    if client.find_text(VPN_TEXT):
        pytest.skip(VPN_MESSAGE)


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await visit_site(client)
    assert client.await_css(LOGIN_CSS, is_displayed=True)
    assert not await client.find_alert(delay=3)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await visit_site(client)
    assert await client.await_alert(UNSUPPORTED_ALERT)
