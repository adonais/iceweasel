// Note: Each #if scope gets checked separately.

// These are in reverse order!
#if A
#  include "mozilla/HashFunctions.h"

#  include <stdio.h>

#  include "jsapi.h"

#  include "ds/LifoAlloc.h"
#  include "js/Value.h"

#  include "vm/Interpreter-inl.h"
#  include "vm/JSScript-inl.h"
#endif

// These are in reverse order, but it's ok due to the #if scopes.
#if B
#  include "vm/Interpreter-inl.h"
#  if C
#    include "js/Value.h"
#    if D
#      include "jsapi.h"
#    endif
#    include <stdio.h>
#  endif
#  include "mozilla/HashFunctions.h"
#endif

#include "jstypes.h"

#include "vm/JSFunction.h"
#include "vm/JSObject.h"
#include "vm/JSScript.h"  // out of order
