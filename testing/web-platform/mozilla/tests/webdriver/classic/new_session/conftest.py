import pytest
from webdriver.transport import HTTPWireProtocol


@pytest.fixture(name="configuration", scope="session")
def fixture_configuration(configuration):
    """Remove "acceptInsecureCerts" from capabilities if it exists.

    Some browser configurations add acceptInsecureCerts capability by default.
    Remove it during new_session tests to avoid interference.
    """
    if "acceptInsecureCerts" in configuration["capabilities"]:
        configuration = dict(configuration)
        del configuration["capabilities"]["acceptInsecureCerts"]
    return configuration


@pytest.fixture(name="new_session")
def fixture_new_session(request, geckodriver):
    """Start a new session for tests which themselves test creating new sessions."""
    custom_session = {}

    driver = geckodriver(force_new=True)

    transport = HTTPWireProtocol(
        driver.hostname,
        driver.port,
        url_prefix="/",
    )

    def _delete_session(session_id):
        transport.send("DELETE", f"session/{session_id}")

    def new_session(body, delete_existing_session=False, headers=None):
        if delete_existing_session:
            _delete_session(custom_session["session"]["sessionId"])

        response = transport.send("POST", "session", body, headers=headers)
        if response.status == 200:
            custom_session["session"] = response.body["value"]
        return response, custom_session.get("session", None)

    yield new_session

    if custom_session.get("session") is not None:
        _delete_session(custom_session["session"]["sessionId"])
        custom_session = None
