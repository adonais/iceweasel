# PR_VersionCheck

Compares the version of NSPR assumed by the caller (the imported
version) with the version being offered by the runtime (the exported
version).

## Syntax

```{code}
#include <prinit.h>

PRBool PR_VersionCheck(const char *importedVersion);
```

### Parameter

{doc}`pr_versioncheck` has one parameter:

`importedVersion`

: The version of the shared library being imported.

### Returns

The function returns one of the following values:

- If the version of the shared library is compatible with that expected
  by the caller, `PR_TRUE`.
- If the versions are not compatible, `PR_FALSE`.

## Description

{doc}`pr_versioncheck` tests whether the version of the library being
imported (`importedVersion`) is compatible with the running version of
the shared library. This is a string comparison of sorts, though the
details of the comparison will vary over time.

## See Also

- [PR_VERSION](pr_version.md)
