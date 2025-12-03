import pytest

URL = "https://godotfest.com/talks"

TOP_BAR_BLUR_CSS = "#menu-blur"
HERO_CSS = ".talk-card__body"


async def are_blurs_working(client):
    # to test, we take a screenshot of the top menu bar, which ought to be blurred,
    # and then hide its blur element and compare the after-screenshot. If they're the
    # same, then the blur would not have actually been working.
    await client.navigate(URL)

    # hide SVGs and text which might interfere with the screenshot.
    client.add_stylesheet(
        """
      * { color: transparent !important; }
      svg { display: none; }
    """
    )

    top_bar_blur = client.await_css(TOP_BAR_BLUR_CSS)
    hero = client.await_css(HERO_CSS, is_displayed=True)

    # scroll down to a point where the site enables the blur and something obvious is behind.
    client.execute_script(
        """
      arguments[0].scrollIntoView({behavior: "instant", block: "start"});
    """,
        hero,
    )

    # now take a screenshot, remove the blur element, and compare.
    await client.stall(0.5)
    pre = client.find_css("body").screenshot()
    client.execute_script("arguments[0].remove()", top_bar_blur)
    await client.stall(0.5)
    post = client.find_css("body").screenshot()
    return pre != post


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert await are_blurs_working(client)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert not await are_blurs_working(client)
