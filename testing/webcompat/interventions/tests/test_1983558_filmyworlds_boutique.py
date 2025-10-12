import pytest

URL = "https://filmyworlds.boutique/"

SUCCESS_CSS = "body.home"
BLOCKED_CSS = "#cf-error-details"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL, wait="none")
    assert client.await_css(SUCCESS_CSS, is_displayed=True)
    assert not client.find_css(BLOCKED_CSS, is_displayed=True)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL, wait="none")
    assert client.await_css(BLOCKED_CSS, is_displayed=True)
    assert not client.find_css(SUCCESS_CSS, is_displayed=True)
