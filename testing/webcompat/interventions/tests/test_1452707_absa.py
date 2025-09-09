import pytest

URL = "https://ib.absa.co.za/absa-online/login.jsp"
UNSUPPORTED_ALERT = "Browser unsupported"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL, wait="none")
    assert client.await_css("html.gecko", is_displayed=True)
    assert not await client.find_alert(delay=3)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL, wait="none")
    assert await client.await_alert(UNSUPPORTED_ALERT)
    assert client.await_css("html.unknown", is_displayed=True)
