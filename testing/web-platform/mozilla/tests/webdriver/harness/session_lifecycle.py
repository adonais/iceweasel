# META: timeout=long

# Tests that the session and bidi_session fixtures correctly restart or reuse
# sessions when capabilities change (webSocketUrl, acceptInsecureCerts) while
# keeping the geckodriver process running. Each test relies on state saved by
# preceding tests, so the order must not be changed.

import pytest
from support.fixtures import _geckodriver_state

_state = {}


def test_classic_session(session):
    driver = _geckodriver_state["current"]

    _state["geckodriver_pid"] = driver.proc.pid
    _state["firefox_pid"] = session.capabilities["moz:processID"]
    _state["session_id"] = session.session_id


def test_classic_session_reuse(session):
    driver = _geckodriver_state["current"]

    assert driver.proc.pid == _state["geckodriver_pid"]
    assert session.capabilities["moz:processID"] == _state["firefox_pid"]
    assert session.session_id == _state["session_id"]


@pytest.mark.asyncio
async def test_bidi_session_new_session(bidi_session):
    driver = _geckodriver_state["current"]

    assert driver.proc.pid == _state["geckodriver_pid"]
    assert bidi_session.capabilities["moz:processID"] != _state["firefox_pid"]
    assert bidi_session.session_id != _state["session_id"]

    _state["firefox_pid"] = bidi_session.capabilities["moz:processID"]
    _state["session_id"] = bidi_session.session_id


@pytest.mark.asyncio
async def test_bidi_session_reuse(bidi_session):
    driver = _geckodriver_state["current"]

    assert driver.proc.pid == _state["geckodriver_pid"]
    assert bidi_session.capabilities["moz:processID"] == _state["firefox_pid"]
    assert bidi_session.session_id == _state["session_id"]


def test_classic_session_after_bidi(session):
    driver = _geckodriver_state["current"]

    assert driver.proc.pid == _state["geckodriver_pid"]
    assert session.capabilities["moz:processID"] != _state["firefox_pid"]
    assert session.session_id != _state["session_id"]

    _state["firefox_pid"] = session.capabilities["moz:processID"]
    _state["session_id"] = session.session_id


def test_classic_session_reuse_after_bidi(session):
    driver = _geckodriver_state["current"]

    assert driver.proc.pid == _state["geckodriver_pid"]
    assert session.capabilities["moz:processID"] == _state["firefox_pid"]
    assert session.session_id == _state["session_id"]


@pytest.mark.capabilities({"acceptInsecureCerts": True})
def test_classic_session_with_accept_insecure_certs(session):
    driver = _geckodriver_state["current"]

    assert driver.proc.pid == _state["geckodriver_pid"]
    assert session.capabilities["moz:processID"] != _state["firefox_pid"]
    assert session.session_id != _state["session_id"]

    _state["firefox_pid"] = session.capabilities["moz:processID"]
    _state["session_id"] = session.session_id


@pytest.mark.capabilities({"acceptInsecureCerts": True})
def test_classic_session_reuse_with_accept_insecure_certs(session):
    driver = _geckodriver_state["current"]

    assert driver.proc.pid == _state["geckodriver_pid"]
    assert session.capabilities["moz:processID"] == _state["firefox_pid"]
    assert session.session_id == _state["session_id"]


def test_classic_session_after_accept_insecure_certs(session):
    driver = _geckodriver_state["current"]

    assert driver.proc.pid == _state["geckodriver_pid"]
    assert session.capabilities["moz:processID"] != _state["firefox_pid"]
    assert session.session_id != _state["session_id"]
