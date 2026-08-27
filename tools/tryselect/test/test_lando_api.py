import json
from textwrap import dedent
from typing import Optional
from unittest import mock

import mozunit
import pytest
from tryselect.lando import LandoAPI, LandoAPIException


def _make_api() -> LandoAPI:
    return LandoAPI(
        access_token="token",
        api_url="lando.example.net",
        instance_id="test",
    )


def _make_response(status_code: int, reason: str, json_valid: bool) -> mock.Mock:
    response = mock.Mock()
    response.status_code = status_code
    response.reason = reason
    if json_valid:
        response.json.return_value = {"detail": "boom"}
    else:
        response.json.side_effect = json.JSONDecodeError("Expecting value", "", 0)
    return response


@mock.patch("tryselect.lando.requests.post")
@pytest.mark.parametrize(
    "status_code,reason,expected,unexpected",
    (
        # A 5xx non-JSON response reports the status and hints it is transient.
        (
            503,
            "Service Unavailable",
            ["HTTP 503", "Service Unavailable", "transient"],
            [],
        ),
        # A 4xx non-JSON response reports the status but gives no transient hint.
        (400, "Bad Request", ["HTTP 400"], ["transient"]),
        # A non-JSON body with a success status still raises a clear error.
        (200, "OK", ["not valid JSON"], []),
    ),
)
def test_post_non_json_raises_readable_error(
    post: mock.Mock, status_code, reason, expected, unexpected
):
    post.return_value = _make_response(status_code, reason, json_valid=False)

    with pytest.raises(LandoAPIException) as excinfo:
        _make_api().post("https://lando.example.net/try/patches", {})

    message = str(excinfo.value)
    for substring in expected:
        assert substring in message
    for substring in unexpected:
        assert substring not in message


@mock.patch("tryselect.lando.requests.post")
def test_post_json_error_status_raises_detail(post: mock.Mock):
    post.return_value = _make_response(400, "Bad Request", json_valid=True)

    with pytest.raises(LandoAPIException, match="boom"):
        _make_api().post("https://lando.example.net/try/patches", {})


@mock.patch("tryselect.lando.Auth0Config")
@pytest.mark.parametrize(
    "section,expected_instance_id",
    (
        ("no_id", "no_id"),
        ("id", "id_present"),
        ("missing", None),
    ),
)
def test_lando_api_from_lando_config_file(
    auth0_config: mock.Mock, section: str, expected_instance_id: Optional[str]
):
    mock_config_path = mock.MagicMock()
    mock_config_path.exists.return_value = True
    mock_config_path.read_text.return_value = dedent("""
       [no_id]
       api_domain = no_id.lando.example.net
       # Lando production Auth0 configuration.
       auth0_domain = auth.example.net
       auth0_client_id = xXxX
       auth0_audience = https://no_id.lando.example.net
       auth0_scope = openid email profile lando https://sso.mozilla.com/claim/groups
       [id]
       instance_id = id_present
       api_domain = id.lando.example.net
       # Lando production Auth0 configuration.
       auth0_domain = auth.example.net
       auth0_client_id = XxXx
       auth0_audience = https://id.lando.example.net
       auth0_scope = openid email profile lando https://sso.mozilla.com/claim/groups
       """)

    if expected_instance_id is None:
        with pytest.raises(
            ValueError, match=f"Lando config file does not have a {section} section."
        ):
            lando_api = LandoAPI.from_lando_config_file(mock_config_path, section)
    else:
        lando_api = LandoAPI.from_lando_config_file(mock_config_path, section)
        assert lando_api.instance_id == expected_instance_id, (
            "Unexpected LandoApi instance_id"
        )


if __name__ == "__main__":
    mozunit.main()
