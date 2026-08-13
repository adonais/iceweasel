import pytest

URL = "https://zs.thnet.gov.cn/index"

HERO_CSS = ".robotSuspension"
SCROLLER_CSS = ".homePage-body"


async def check_scrolling_works(client, in_headless_mode):
    if in_headless_mode:
        pytest.xfail("Skipping as test does not work properly in headless mode.")
        return False

    await client.navigate(URL, wait="none", timeout=30)
    client.await_css(HERO_CSS, is_displayed=True)
    scroller = client.await_css(SCROLLER_CSS, is_displayed=True)
    initial_transform = client.execute_script(
        "return arguments[0].style.transform", scroller
    )
    client.apz_scroll(client.await_css("body"), dy=1000)
    return initial_transform < client.execute_script(
        "return arguments[0].style.transform", scroller
    )


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client, in_headless_mode):
    assert await check_scrolling_works(client, in_headless_mode)


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client, in_headless_mode):
    assert not await check_scrolling_works(client, in_headless_mode)
