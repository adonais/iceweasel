import pytest
from support.addons import is_addon_private_browsing_allowed
from tests.bidi.web_extension import assert_extension_id

pytestmark = pytest.mark.asyncio


@pytest.mark.geckodriver(allow_system_access=True)
@pytest.mark.parametrize(
    "allowPrivateBrowsing",
    [None, False, True],
    ids=["default", "disallow", "allow"],
)
@pytest.mark.parametrize("permanent", [True, False], ids=["permanent", "temporary"])
async def test_install_with_allow_private_browsing(
    bidi_session,
    current_session,
    extension_data,
    install_webextension,
    use_pref,
    allowPrivateBrowsing,
    permanent,
):
    data = {"type": "base64"}
    unsigned_tag = "" if permanent else "Unsigned"
    extension_data_value = extension_data[f"base64{unsigned_tag}"]
    data.update({"value": extension_data_value})

    extension_params = (
        {"moz:permanent": permanent, "moz:allowPrivateBrowsing": allowPrivateBrowsing}
        if allowPrivateBrowsing is not None
        else {}
    )

    await use_pref("xpinstall.signatures.required", True)

    web_extension = await install_webextension(
        extension_data=data,
        _extension_params=extension_params,
    )

    assert_extension_id(web_extension, extension_data)
    assert is_addon_private_browsing_allowed(current_session, web_extension) is bool(
        allowPrivateBrowsing
    )
