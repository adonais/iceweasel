import pytest

URL = "https://las.cnas.org.cn/LAS/index.jsp"
HERO_CSS = "#loginbox"
UNSUPPORTED_CSS = "#alertBrowser_c"


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await client.make_preload_script("delete navigator.__proto__.webdriver")
    await client.navigate(URL)
    assert client.await_css(HERO_CSS, is_displayed=True, timeout=30)
    await client.stall(5)
    assert not client.find_css(UNSUPPORTED_CSS, is_displayed=True)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await client.make_preload_script("delete navigator.__proto__.webdriver")
    await client.navigate(URL)
    assert client.await_css(UNSUPPORTED_CSS, is_displayed=True, timeout=30)
