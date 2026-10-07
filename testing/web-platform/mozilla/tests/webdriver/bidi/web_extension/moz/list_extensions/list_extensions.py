import pytest
from support.addons import disable_addon

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize(
    "allow_system_access",
    [
        pytest.param(False, marks=pytest.mark.geckodriver(allow_system_access=False)),
        pytest.param(True, marks=pytest.mark.geckodriver(allow_system_access=True)),
    ],
)
async def test_list_extensions_with_installed_extension(
    bidi_session,
    extension_data,
    install_webextension,
    send_blocking_command,
    allow_system_access,
):
    result_before = await send_blocking_command("webExtension.moz:listExtensions", {})
    extension_ids_before = [ext["id"] for ext in result_before["extensions"]]
    assert extension_data["id"] not in extension_ids_before

    extension_id = await install_webextension(
        extension_data={
            "type": "path",
            "path": extension_data["path"],
        }
    )

    result = await send_blocking_command("webExtension.moz:listExtensions", {})
    assert isinstance(result, dict)
    extensions = result["extensions"]
    assert isinstance(extensions, list)
    assert all(ext["hidden"] is False for ext in extensions)

    extension_details = next(ext for ext in extensions if ext["id"] == extension_id)
    assert extension_details["name"] == "install test"
    assert extension_details["version"] == "1.0"
    assert extension_details["manifestVersion"] == 3
    assert extension_details["isActive"] is True
    assert isinstance(extension_details["isSystem"], bool)
    assert extension_details["hidden"] is False
    assert extension_details["temporarilyInstalled"] is True
    expected_fields = {
        "hidden",
        "id",
        "isActive",
        "isSystem",
        "manifestVersion",
        "name",
        "temporarilyInstalled",
        "version",
    }
    if allow_system_access:
        expected_fields.update({"policy", "sourceURL"})
        assert extension_details["sourceURL"] is None or isinstance(
            extension_details["sourceURL"], str
        )
        policy = extension_details["policy"]
        assert isinstance(policy, dict)
        for field in ("uuid", "baseURL", "extensionURL"):
            assert isinstance(policy[field], str)
        assert isinstance(policy["backgroundScripts"], list)
        assert all(isinstance(script, str) for script in policy["backgroundScripts"])

    for extension in extensions:
        assert set(extension) == expected_fields


@pytest.mark.geckodriver(allow_system_access=True)
async def test_list_extensions_with_disabled_extension(
    bidi_session,
    current_session,
    extension_data,
    install_webextension,
    send_blocking_command,
):
    extension_id = await install_webextension(
        extension_data={
            "type": "base64",
            "value": extension_data["base64"],
        }
    )

    disable_addon(current_session, extension_id)

    result = await send_blocking_command("webExtension.moz:listExtensions", {})
    extension_details = next(
        ext for ext in result["extensions"] if ext["id"] == extension_id
    )
    assert extension_details["manifestVersion"] == 3
    assert extension_details["isActive"] is False
    assert extension_details["hidden"] is False
    assert extension_details["temporarilyInstalled"] is True
    assert extension_details["sourceURL"] is None or isinstance(
        extension_details["sourceURL"], str
    )
    assert extension_details["policy"] is None
