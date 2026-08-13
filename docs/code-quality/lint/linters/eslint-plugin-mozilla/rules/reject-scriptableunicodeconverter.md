# reject-scriptableunicodeconverter

Rejects calls into `Ci.nsIScriptableUnicodeConverter`. This is configured as a warning.
You should use {searchfox}`TextEncoder <dom/webidl/TextEncoder.webidl>` or
{searchfox}`TextDecoder <dom/webidl/TextDecoder.webidl>` for new code.
If modifying old code, please consider swapping it in if possible; if this is tricky please ensure
a bug is on file.
