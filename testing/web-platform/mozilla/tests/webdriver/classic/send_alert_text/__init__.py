def send_alert_text(session, text=None):
    return session.transport.send(
        "POST",
        "session/{session_id}/alert/text".format(**vars(session)),
        {"text": text},
    )
