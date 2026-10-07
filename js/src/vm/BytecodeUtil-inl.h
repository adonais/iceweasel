/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef vm_BytecodeUtil_inl_h
#define vm_BytecodeUtil_inl_h

#include "vm/BytecodeUtil.h"

namespace js {

static inline unsigned GetDefCount(jsbytecode* pc) {
  /*
   * Add an extra pushed value for Or/And opcodes, so that they are included
   * in the pushed array of stack values for type inference.
   */
  JSOp op = JSOp(*pc);
  switch (op) {
    case JSOp::Or:
    case JSOp::And:
    case JSOp::Coalesce:
      return 1;
    case JSOp::Pick:
    case JSOp::Unpick:
      /*
       * Pick pops and pushes how deep it looks in the stack + 1
       * items. i.e. if the stack were |a b[2] c[1] d[0]|, pick 2
       * would pop b, c, and d to rearrange the stack to |a c[0]
       * d[1] b[2]|.
       */
      return pc[1] + 1;
    default:
      return StackDefs(op);
  }
}

static inline unsigned GetUseCount(jsbytecode* pc) {
  JSOp op = JSOp(*pc);
  if (op == JSOp::Pick || op == JSOp::Unpick) {
    return pc[1] + 1;
  }

  return StackUses(op, pc);
}

static inline JSOp ReverseCompareOp(JSOp op) {
  switch (op) {
    case JSOp::Gt:
      return JSOp::Lt;
    case JSOp::Ge:
      return JSOp::Le;
    case JSOp::Lt:
      return JSOp::Gt;
    case JSOp::Le:
      return JSOp::Ge;
    case JSOp::Eq:
    case JSOp::Ne:
    case JSOp::StrictEq:
    case JSOp::StrictNe:
      return op;
    default:
      MOZ_CRASH("unrecognized op");
  }
}

static inline JSOp NegateCompareOp(JSOp op) {
  switch (op) {
    case JSOp::Gt:
      return JSOp::Le;
    case JSOp::Ge:
      return JSOp::Lt;
    case JSOp::Lt:
      return JSOp::Ge;
    case JSOp::Le:
      return JSOp::Gt;
    case JSOp::Eq:
      return JSOp::Ne;
    case JSOp::Ne:
      return JSOp::Eq;
    case JSOp::StrictNe:
      return JSOp::StrictEq;
    case JSOp::StrictEq:
      return JSOp::StrictNe;
    default:
      MOZ_CRASH("unrecognized op");
  }
}

}  // namespace js

#endif /* vm_BytecodeUtil_inl_h */
