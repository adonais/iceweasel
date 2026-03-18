import pytest

URL = "https://lacunacoil.com/"
COOKIES_CSS = "#my-agile-privacy-notification-area, [aria-modal=true]"
BUTTON_CSS = ".elementor-button"


async def can_click_buttons(client):
    # await client.make_preload_script("delete navigator.__proto__.webdriver")
    await client.navigate(URL, wait="none")
    client.hide_elements(COOKIES_CSS)
    await client.stall(1)
    client.execute_script(
        """
        document.documentElement.addEventListener(
          "click",
          e => { e.preventDefault(); alert("clicked") },
          true
        );
    """
    )
    client.await_css(BUTTON_CSS, is_displayed=True).click()
    return await client.find_alert("clicked", delay=3)


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert await can_click_buttons(client)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert not await can_click_buttons(client)
