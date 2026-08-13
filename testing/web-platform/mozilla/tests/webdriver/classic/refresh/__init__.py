def refresh(session):
    return session.transport.send(
        "POST", "session/{session_id}/refresh".format(**vars(session))
    )
