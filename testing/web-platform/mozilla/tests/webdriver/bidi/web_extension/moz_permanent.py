import pytest
from support.addons import is_addon_temporary_installed
from tests.bidi.web_extension import assert_extension_id
from webdriver.bidi import error

pytestmark = pytest.mark.asyncio


@pytest.mark.geckodriver(allow_system_access=True)
@pytest.mark.parametrize(
    "permanent", [None, False, True], ids=["default", "temporary", "permanent"]
)
@pytest.mark.parametrize("mode", ["archivePath", "base64", "path"])
@pytest.mark.parametrize("signed", [True, False], ids=["signed", "unsigned"])
async def test_install_with_permanent(
    bidi_session,
    current_session,
    extension_data,
    install_webextension,
    use_pref,
    mode,
    permanent,
    signed,
):
    if mode == "path" and signed:
        # Unpacked extensions are not signed and cannot be installed permanently
        return

    data = {"type": mode}
    unsigned_tag = "" if signed or mode == "path" else "Unsigned"
    extension_data_value = extension_data[f"{mode}{unsigned_tag}"]
    if mode == "base64":
        data.update({"value": extension_data_value})
    else:
        data.update({"path": extension_data_value})

    extension_params = {"moz:permanent": permanent} if permanent is not None else {}

    await use_pref("xpinstall.signatures.required", True)

    if permanent and not signed:
        with pytest.raises(error.InvalidWebExtensionException):
            await install_webextension(
                extension_data=data,
                _extension_params=extension_params,
            )
        return

    web_extension = await install_webextension(
        extension_data=data,
        _extension_params=extension_params,
    )

    assert_extension_id(web_extension, extension_data)
    assert is_addon_temporary_installed(current_session, web_extension) is not bool(
        permanent
    )
