import pytest

URL = "https://community.acer.com/en/kb/articles/18840-update-your-secure-boot-certificates-before-2026-to-stay-protected?expandedToggles=toggle-notebooks%2Ctoggle-desktops"

COOKIES_CSS = "#onetrust-consent-sdk"
EXPANDER_CSS = "button[aria-controls=toggle-notebooks-content]"
CONTAINER_CSS = "#toggle-notebooks-content"
TABLE_CSS = "#toggle-notebooks-content table"


async def is_full_table_visible(client):
    await client.navigate(URL, wait="none")
    client.hide_elements(COOKIES_CSS)
    expander = client.await_css(EXPANDER_CSS, is_displayed=True)
    if not client.execute_script("return arguments[0].ariaExpanded", expander):
        expander.click()
        await client.stall(0.5)
    return client.execute_script(
        """
      return arguments[0].clientHeight >= arguments[1].clientHeight;
    """,
        client.await_css(CONTAINER_CSS, is_displayed=True),
        client.await_css(TABLE_CSS, is_displayed=True),
    )


@pytest.mark.need_visible_scrollbars
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert await is_full_table_visible(client)


@pytest.mark.need_visible_scrollbars
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert not await is_full_table_visible(client)
