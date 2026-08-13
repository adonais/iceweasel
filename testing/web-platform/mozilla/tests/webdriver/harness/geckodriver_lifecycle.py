# META: timeout=long

# Tests that the geckodriver fixture correctly restarts or reuses the
# geckodriver process and Firefox session depending on extra_args, extra_env,
# hostname, capabilities, and force_new. Each test relies on state saved by
# preceding tests, so the order must not be changed.

import pytest
from support.fixtures import _geckodriver_state

_state = {}


def test_session_default_args(session):
    driver = _geckodriver_state["current"]

    _state["geckodriver_pid"] = driver.proc.pid
    _state["firefox_pid"] = session.capabilities["moz:processID"]
    _state["session_id"] = session.session_id


def test_session_reuse_with_default_args(session):
    driver = _geckodriver_state["current"]

    assert driver.proc.pid == _state["geckodriver_pid"]
    assert session.capabilities["moz:processID"] == _state["firefox_pid"]
    assert session.session_id == _state["session_id"]


@pytest.mark.geckodriver(allow_system_access=True)
def test_session_restart_with_allow_system_access(session):
    driver = _geckodriver_state["current"]

    assert driver.proc.pid != _state["geckodriver_pid"]
    assert session.capabilities["moz:processID"] != _state["firefox_pid"]
    assert session.session_id != _state["session_id"]

    _state["geckodriver_pid"] = driver.proc.pid
    _state["firefox_pid"] = session.capabilities["moz:processID"]
    _state["session_id"] = session.session_id


def test_session_restart_back_to_default_args(session):
    driver = _geckodriver_state["current"]

    assert driver.proc.pid != _state["geckodriver_pid"]
    assert session.capabilities["moz:processID"] != _state["firefox_pid"]
    assert session.session_id != _state["session_id"]

    _state["geckodriver_pid"] = driver.proc.pid
    _state["firefox_pid"] = session.capabilities["moz:processID"]
    _state["session_id"] = session.session_id


@pytest.mark.geckodriver(force_new=True)
def test_session_restart_with_force_new(session):
    driver = _geckodriver_state["current"]

    assert driver.proc.pid != _state["geckodriver_pid"]
    assert session.capabilities["moz:processID"] != _state["firefox_pid"]
    assert session.session_id != _state["session_id"]

    _state["geckodriver_pid"] = driver.proc.pid
    _state["firefox_pid"] = session.capabilities["moz:processID"]
    _state["session_id"] = session.session_id


@pytest.mark.geckodriver(force_new=True)
def test_session_restart_with_force_new_again(session):
    driver = _geckodriver_state["current"]

    assert driver.proc.pid != _state["geckodriver_pid"]
    assert session.capabilities["moz:processID"] != _state["firefox_pid"]
    assert session.session_id != _state["session_id"]

    _state["geckodriver_pid"] = driver.proc.pid
    _state["firefox_pid"] = session.capabilities["moz:processID"]
    _state["session_id"] = session.session_id


def test_session_reuse_after_force_new(session):
    driver = _geckodriver_state["current"]

    assert driver.proc.pid == _state["geckodriver_pid"]
    assert session.capabilities["moz:processID"] == _state["firefox_pid"]
    assert session.session_id == _state["session_id"]


def test_profile_is_not_harness_profile(session, profile_folder):
    assert session.capabilities["moz:profile"] != profile_folder


def test_restart_with_extra_args(geckodriver):
    driver = geckodriver(extra_args=["--jsdebugger"])
    driver.new_session()

    assert driver.proc.pid != _state["geckodriver_pid"]
    assert driver.session.capabilities["moz:processID"] != _state["firefox_pid"]
    assert driver.session.session_id != _state["session_id"]

    _state["geckodriver_pid"] = driver.proc.pid
    _state["firefox_pid"] = driver.session.capabilities["moz:processID"]
    _state["session_id"] = driver.session.session_id


def test_reuse_with_same_extra_args(geckodriver):
    driver = geckodriver(extra_args=["--jsdebugger"])
    driver.new_session()

    assert driver.proc.pid == _state["geckodriver_pid"]
    assert driver.session.capabilities["moz:processID"] == _state["firefox_pid"]
    assert driver.session.session_id == _state["session_id"]


def test_restart_with_extra_env(geckodriver):
    driver = geckodriver(extra_env={"MOZ_LOG": "1"})
    driver.new_session()

    assert driver.proc.pid != _state["geckodriver_pid"]
    assert driver.session.capabilities["moz:processID"] != _state["firefox_pid"]
    assert driver.session.session_id != _state["session_id"]

    _state["geckodriver_pid"] = driver.proc.pid
    _state["firefox_pid"] = driver.session.capabilities["moz:processID"]
    _state["session_id"] = driver.session.session_id


def test_reuse_with_same_extra_env(geckodriver):
    driver = geckodriver(extra_env={"MOZ_LOG": "1"})
    driver.new_session()

    assert driver.proc.pid == _state["geckodriver_pid"]
    assert driver.session.capabilities["moz:processID"] == _state["firefox_pid"]
    assert driver.session.session_id == _state["session_id"]


def test_restart_with_hostname(geckodriver, configuration):
    default_host = configuration["host"]
    other_host = "localhost" if default_host == "127.0.0.1" else "127.0.0.1"

    driver = geckodriver(hostname=other_host)
    driver.new_session()

    assert driver.proc.pid != _state["geckodriver_pid"]
    assert driver.session.capabilities["moz:processID"] != _state["firefox_pid"]
    assert driver.session.session_id != _state["session_id"]

    _state["geckodriver_pid"] = driver.proc.pid
    _state["firefox_pid"] = driver.session.capabilities["moz:processID"]
    _state["session_id"] = driver.session.session_id


def test_reuse_with_same_hostname(geckodriver, configuration):
    default_host = configuration["host"]
    other_host = "localhost" if default_host == "127.0.0.1" else "127.0.0.1"

    driver = geckodriver(hostname=other_host)
    driver.new_session()

    assert driver.proc.pid == _state["geckodriver_pid"]
    assert driver.session.capabilities["moz:processID"] == _state["firefox_pid"]
    assert driver.session.session_id == _state["session_id"]


def test_bidi_enabled_by_default(geckodriver):
    driver = geckodriver()
    driver.new_session()

    _state["geckodriver_pid"] = driver.proc.pid
    _state["firefox_pid"] = driver.session.capabilities["moz:processID"]
    _state["session_id"] = driver.session.session_id

    assert driver.session.capabilities["webSocketUrl"].endswith(
        driver.session.session_id
    )


def test_bidi_disabled_with_capability(geckodriver):
    driver = geckodriver()
    driver.new_session(capabilities={"webSocketUrl": False})

    assert driver.proc.pid == _state["geckodriver_pid"]
    assert driver.session.capabilities["moz:processID"] != _state["firefox_pid"]
    assert driver.session.session_id != _state["session_id"]

    _state["firefox_pid"] = driver.session.capabilities["moz:processID"]
    _state["session_id"] = driver.session.session_id

    assert "webSocketUrl" not in driver.session.capabilities


def test_bidi_reenabled_without_capability(geckodriver):
    driver = geckodriver()
    driver.new_session()

    assert driver.proc.pid == _state["geckodriver_pid"]
    assert driver.session.capabilities["moz:processID"] != _state["firefox_pid"]
    assert driver.session.session_id != _state["session_id"]

    assert driver.session.capabilities["webSocketUrl"].endswith(
        driver.session.session_id
    )
