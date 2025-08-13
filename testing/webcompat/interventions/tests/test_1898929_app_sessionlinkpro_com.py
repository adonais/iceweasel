import pytest

URL = "https://app.sessionlinkpro.com/"

UNSUPPORTED_ALERT = "browser is not compatible"
LOGIN_CSS = "#usr_name"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL, wait="none")
    assert client.await_css(LOGIN_CSS, is_displayed=True)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    alert = await client.await_alert(UNSUPPORTED_ALERT)
    await client.navigate(URL, wait="none")
    await alert
