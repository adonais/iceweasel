// The single translation unit that provides the dr_wav implementation for
// the whole parakeet build. Both libparakeet (src/audio_io.cpp) and, when
// PARAKEET_WITH_CED is on, ced.cpp (built with CED_EXTERNAL_DR_WAV) declare
// dr_wav's functions via #include "dr_wav.h" without defining
// DR_WAV_IMPLEMENTATION themselves, and link against this object instead.
// That keeps there being exactly one copy of dr_wav's symbols in the final
// binary (a second DR_WAV_IMPLEMENTATION define anywhere else would be a
// multiple-definition link error) and, unlike having libparakeet itself own
// the implementation, does not create a link-time dependency cycle between
// the parakeet and ced static libraries.
#define DR_WAV_IMPLEMENTATION
#include "dr_wav.h"
