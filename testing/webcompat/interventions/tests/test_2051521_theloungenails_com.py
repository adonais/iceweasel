import pytest

URL = "https://theloungenails.com/Home/AppointmentLink"
IFRAME_CSS = "iframe[src*=nailsolutionplus]"
SUPPORTED_CSS = ".tab-content"
UNSUPPORTED_ALERT = "browser is not supported"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL)
    client.switch_to_frame(client.await_css(IFRAME_CSS))
    client.await_css(SUPPORTED_CSS, is_displayed=True)
    assert not await client.find_alert(delay=2)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL, wait="none")
    assert await client.await_alert(UNSUPPORTED_ALERT)
