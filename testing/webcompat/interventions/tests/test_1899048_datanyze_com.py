import pytest

URL = "https://www.datanyze.com/companies/alodokter/399453377"

# The site ends up showing us different captchas for the failure
# case and the case when its bot-detection has been triggered,
# so we can still write a test, but it may not always run successfully.

CAPTCHA_CSS = ".main-wrapper .zone-name-title"
SUPPORTED_CSS = "app-company"
UNSUPPORTED_CSS = "#px-captcha-wrapper"


async def visit_site(client):
    await client.make_preload_script("delete navigator.__proto__.webdriver")
    await client.navigate(URL, wait="none")
    _, _, captcha = client.await_first_element_of(
        [
            client.css(SUPPORTED_CSS),
            client.css(UNSUPPORTED_CSS),
            client.css(CAPTCHA_CSS),
        ],
        is_displayed=True,
    )
    if captcha:
        pytest.skip("Site presented an infinite captcha; please test manually")


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    await visit_site(client)
    assert client.await_css(SUPPORTED_CSS, is_displayed=True)
    assert not client.find_css(UNSUPPORTED_CSS, is_displayed=True)


@pytest.mark.skip_platforms("android")
@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    await visit_site(client)
    assert client.await_css(UNSUPPORTED_CSS, is_displayed=True)
    assert not client.find_css(SUPPORTED_CSS, is_displayed=True)
