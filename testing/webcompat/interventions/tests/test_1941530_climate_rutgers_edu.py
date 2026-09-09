import pytest

URL = "https://climate.rutgers.edu/snowcover/index.php"
IMG_CSS = ".u--svg-inside object"


async def is_image_correct_size(client):
    await client.navigate(URL)
    img = client.await_css(IMG_CSS, is_displayed=True)
    return client.execute_script(
        """
       const img = arguments[0];
       img.style.border = "none";
       return img.clientWidth > 0;
    """,
        img,
    )


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_regression(client):
    assert await is_image_correct_size(client)
