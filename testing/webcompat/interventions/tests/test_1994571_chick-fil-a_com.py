import pytest

URL = "https://www.chick-fil-a.com/careers"
ICONS_CSS = ".classic-callout img"


async def are_icons_stretched(client):
    await client.navigate(URL, wait="none")
    client.await_css(ICONS_CSS, is_displayed=True)
    return client.execute_script(
        """
        const icon_imgs = document.querySelectorAll(arguments[0]);
        for (const img of icon_imgs) {
          const box = img.getBoundingClientRect();
          const actual_ratio = box.height / box.width;
          const expected_ratio = img.naturalHeight / img.naturalWidth;
          if (!isNaN(expected_ratio) && parseInt(actual_ratio * 10) !== parseInt(expected_ratio * 10)) {
            return true;
          }
        }
        return false;
      """,
        ICONS_CSS,
    )


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert not await are_icons_stretched(client)


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert await are_icons_stretched(client)


@pytest.mark.only_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_works_on_android(client):
    assert not await are_icons_stretched(client)
