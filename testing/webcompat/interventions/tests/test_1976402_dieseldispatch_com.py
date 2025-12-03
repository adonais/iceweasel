import asyncio

import pytest

URL = "https://dieseldispatch.com/"
HERO_CSS = "a[href*=trackmyvehicle]"
SECTION_CSS = ".section-wrapper.ng-trigger-stats"


async def can_scroll(client):
    await client.navigate(URL, wait="none")
    hero = client.await_css(HERO_CSS, is_displayed=True)
    await asyncio.sleep(1)
    section = client.await_css(SECTION_CSS, is_displayed=True)
    original_transform = client.execute_script(
        "return arguments[0].style.transform", section
    )
    await client.send_apz_scroll_gesture(-400, element=hero, offset=[40, 40])
    await asyncio.sleep(1)
    final_transform = client.execute_script(
        "return arguments[0].style.transform", section
    )
    return original_transform != final_transform


# testing APZ scrolls doesn't work on Android right now, so skip testing there.


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_regression(client):
    assert await can_scroll(client)
