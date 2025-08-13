import pytest

URL = "https://www.publix.com/"

HERO_CSS = ".widget.banner.standard"
LINKS_CSS = "a[href^='javascript:EventBus'][href*=InstacartRedirectModal]"


async def does_have_bad_jslinks(client):
    await client.make_preload_script(
        "navigator.geolocation.getCurrentPosition = () => {}"
    )
    await client.navigate(URL, wait="none")
    client.await_css(HERO_CSS, is_displayed=True)
    return 0 < len(client.await_css(LINKS_CSS, is_displayed=True, all=True))


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_regression(client):
    assert await does_have_bad_jslinks(client)
