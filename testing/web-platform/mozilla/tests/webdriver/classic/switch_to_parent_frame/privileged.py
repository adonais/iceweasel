from tests.support.classic.asserts import assert_success


def switch_to_parent_frame(session):
    return session.transport.send("POST", f"session/{session.session_id}/frame/parent")


# Selecting the parent browsing context doesn't interact with the page.


def test_parent_process_context_without_system_access(parent_process_session):
    response = switch_to_parent_frame(parent_process_session)
    assert_success(response)


def test_extension_context_without_system_access(session, install_new_tab_extension):
    handle, _ = install_new_tab_extension
    session.window_handle = handle
    assert session.url.startswith("moz-extension://")

    response = switch_to_parent_frame(session)
    assert_success(response)
