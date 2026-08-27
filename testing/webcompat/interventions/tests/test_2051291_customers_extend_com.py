import pytest

URL = "https://customers.extend.com/en-US/authentication"

# Desktop shows an email field; Android shows a phone-number field.
LOGIN_FIELD = "input[type=email], input[type=tel]"
TYPED_TEXT = "5551234567"

FIELD_ON_TOP = """
    const el = arguments[0];
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top === el || el.contains(top);
"""


async def login_field_is_usable(client):
    await client.navigate(URL, wait="none")
    # Wait until the form is actually visible and usable.
    # The field must be visible and not covered by the splash screen.
    # We check both conditions because is_displayed() returns True even when
    # an element is hidden behind an overlay.
    # Poll for up to 5 seconds to allow the splash to disappear.
    for _ in range(10):
        field = client.find_css(LOGIN_FIELD, is_displayed=True)
        if field and client.execute_script(FIELD_ON_TOP, field):
            break
        await client.stall(0.5)
    else:
        # Field never surfaced above the overlay within the timeout → broken.
        return False
    # It's genuinely visible and clickable — now confirm it accepts typed input.
    field.click()
    field.send_keys(TYPED_TEXT)
    return bool(client.execute_script("return arguments[0].value", field))


@pytest.mark.asyncio
@pytest.mark.with_interventions
async def test_enabled(client):
    assert await login_field_is_usable(client)


@pytest.mark.asyncio
@pytest.mark.without_interventions
async def test_disabled(client):
    assert not await login_field_is_usable(client)
