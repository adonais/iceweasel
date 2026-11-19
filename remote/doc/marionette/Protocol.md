# Protocol

Marionette uses a simple JSON-based wire protocol over a TCP socket.
Each `command` message carries a message ID, and the server includes
that same ID in its `response`.

Clients **must** send commands one at a time. After sending a
command, wait for its response before sending the next one.
Firefox's WebDriver Classic implementation assumes commands are
handled one after another. Sending a command while an earlier one is
still running is not supported and can break things. For example,
the response may never arrive, or an error may be reported for the
wrong command. One such case is sending `WebDriver:SwitchToWindow`
while `WebDriver:Navigate` is still running ([bug 2081191]).

If you need to run commands in parallel, use [WebDriver BiDi]
instead. Its protocol supports this by design.

Schematic flow of messages:

```text
          client      server
            |            |
msgid=1     |----------->|
            |  command   |
            |            |
msgid=1     |<-----------|
            |  response  |
            |            |
msgid=2     |----------->|
            |  command   |
            |            |
msgid=2     |<-----------|
            |  response  |
            |            |
```

The protocol consists of a `command` message and the corresponding
`response` message.  A `response` message must always be sent in
reply to a `command` message.  Clients should still verify that
the message ID of a received `response` matches that of the
`command` they sent.

[bug 2081191]: https://bugzil.la/2081191
[WebDriver BiDi]: /remote/index.md#webdriver-bidi

## Command

The request, or `command` message, is a four element JSON Array as shown
below, that may originate from either the client- or server remote ends:

```python
[type, message ID, command, parameters]
```

* _type_ must be 0 (integer).  This indicates that the message
  is a `command`.

* _message ID_ is a 32-bit unsigned integer.  This number is
  used as a sequencing number that uniquely identifies a pair of
  `command` and `response` messages.  The other remote part will
  reply with a corresponding `response` with the same message ID.

* _command_ is a string identifying the RPC method or command
  to execute.

* _parameters_ is an arbitrary JSON serialisable object.

## Response

The response message is also a four element array as shown below,
and must always be sent after receiving a `command`:

```python
[type, message ID, error, result]
```

* _type_ must be 1 (integer).  This indicates that the message is a
  `response`.

* _message ID_ is a 32-bit unsigned integer.  This corresponds
  to the `command`’s message ID.

* _error_ is null if the command executed correctly.  If the
  error occurred on the server-side, then this is an [error] object.

* _result_ is the result object from executing the `command`, if
  it executed correctly.  If an error occurred on the server-side,
  this field is null.

The structure of the result field can vary, but is documented
individually for each command.

## Error object

An error object is a serialisation of JavaScript error types,
and it is structured like this:

```javascript
{
  "error": "invalid session id",
  "message": "No active session with ID 1234",
  "stacktrace": ""
}
```

All the fields of the error object are required, so the stacktrace and
message fields may be empty strings.  The error field is guaranteed
to be one of the JSON error codes as laid out by the [WebDriver standard].

## Clients

Clients may be implemented in any language that is capable of writing
and receiving data over TCP socket.  A [reference client] is provided.
Whatever language or I/O model a client uses, it must send commands
in sequence, as described above.

[WebDriver standard]: https://w3c.github.io/webdriver/#dfn-error-code
[reference client]: https://searchfox.org/firefox-main/source/testing/marionette/client/
