import pytest

URL = "https://envios.mercadolibre.com.ar/shipping/agencies-map/pick-up?zip_code=4500"

APP_CSS = "#root-app"


async def content_is_visible(client):
    await client.navigate(URL, wait="none")
    app = client.await_css(APP_CSS, is_displayed=True)
    return client.execute_script("return arguments[0].clientHeight > 0", app)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert await content_is_visible(client)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert not await content_is_visible(client)
