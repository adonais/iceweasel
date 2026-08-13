import pytest

URL = "https://ebok.citylink.pl/"
LOGIN_CSS = "input[placeholder=Login]"
MENU_CSS = "#ext-widget-1"


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.navigate(URL, wait="none")
    assert client.await_css(LOGIN_CSS, is_displayed=True)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.navigate(URL, wait="none")
    assert client.await_css(MENU_CSS, is_displayed=True)
    assert not client.find_css(LOGIN_CSS, is_displayed=True)
