import pytest
from webdriver.error import NoSuchElementException

URL = "https://rosasthai.com/locations"

COOKIES_CSS = "#ccc"
VIEW_ALL_CSS = "#view-all"
LOADING_CSS = ".loading-location"
SUCCESSFUL_LOAD_CSS = "#panel > [id]"


async def does_clicking_work(client):
    await client.navigate(URL, wait="none")
    client.hide_elements(COOKIES_CSS)
    client.await_css(VIEW_ALL_CSS, is_displayed=True).click()
    try:
        client.await_css(LOADING_CSS, is_displayed=True, timeout=3)
    except NoSuchElementException:
        return False
    client.await_element_hidden(client.css(LOADING_CSS))
    client.await_css(SUCCESSFUL_LOAD_CSS, is_displayed=True)
    return True


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert await does_clicking_work(client)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert not await does_clicking_work(client)
