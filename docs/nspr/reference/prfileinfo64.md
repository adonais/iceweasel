# PRFileInfo64

File information structure used with {doc}`pr_getfileinfo64` and
{doc}`pr_getopenfileinfo64`.

## Syntax

```{code}
#include <prio.h>

struct PRFileInfo64 {
   PRFileType type;
   PRUint64 size;
   PRTime creationTime;
   PRTime modifyTime;
};

typedef struct PRFileInfo64 PRFileInfo64;
```

### Fields

The structure has the following fields:

`type`

: Type of file. See {doc}`prfiletype`.

`size`

: 64-bit size, in bytes, of file's contents.

`creationTime`

: Creation time per definition of {doc}`prtime`. See
  {searchfox}`prtime.h <nsprpub/pr/include/prtime.h>`.

`modifyTime`

: Last modification time per definition of {doc}`prtime`. See
  {searchfox}`prtime.h <nsprpub/pr/include/prtime.h>`.

## Description

The {doc}`prfileinfo64` structure provides information about a file, a
directory, or some other kind of file system object, as specified by the
`type` field.
