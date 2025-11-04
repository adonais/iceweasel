import pytest

URL = "https://previewinsights.qualtrics.com/jfe/form/SV_a5Gnoq0OsdUzvGm?Q_DL=hq7SUdQWjweSxhT_a5Gnoq0OsdUzvGm_CGC_DNCiEfKhsuDlymq&Q_CHL=email"

WATCH_NOW_CSS = "a[href*='portal.pilot.ly/process-target']"
AVANTI_CSS = "button.begin-registration"
SUPPORTED_CSS = "#root .pilotly-player"
UNSUPPORTED_TEXT1 = "Firefox not supported"
UNSUPPORTED_TEXT2 = "Google Chrome"


async def get_to_page(client):
    await client.navigate(URL, wait="none")
    client.soft_click(client.await_css(WATCH_NOW_CSS, is_displayed=True))
    client.soft_click(client.await_css(AVANTI_CSS, is_displayed=True))


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await get_to_page(client)
    assert client.await_css(SUPPORTED_CSS, is_displayed=True)
    assert not client.find_text(UNSUPPORTED_TEXT2, is_displayed=True)
    assert not client.find_text(UNSUPPORTED_TEXT2, is_displayed=True)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await get_to_page(client)
    no_firefox, use_chrome = client.await_first_element_of(
        [
            client.text(UNSUPPORTED_TEXT1),
            client.text(UNSUPPORTED_TEXT2),
        ],
        is_displayed=True,
    )
    assert no_firefox or use_chrome
    assert not client.find_css(SUPPORTED_CSS, is_displayed=True)
