/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

#include "wasm/WasmComponent.h"

#include "wasm/WasmBinary.h"
#include "wasm/WasmFeatures.h"
#include "wasm/WasmGenerator.h"
#include "wasm/WasmValidate.h"

#ifdef ENABLE_WASM_COMPONENTS

#  include "js/friend/ErrorMessages.h"  // js::GetErrorMessage, JSMSG_*
#  include "js/Printf.h"                // JS_smprintf
#  include "js/PropertyAndElement.h"
#  include "threading/ExclusiveData.h"
#  include "util/Text.h"
#  include "vm/GlobalObject.h"
#  include "vm/MutexIDs.h"
#  include "vm/ObjectOperations.h"
#  include "wasm/WasmJS.h"

#  include "vm/JSAtomUtils-inl.h"
#  include "wasm/WasmInstance-inl.h"

using namespace js;
using namespace js::wasm;

#  ifdef DEBUG
static bool NameIsProbablyValid(mozilla::Span<const char> name) {
  for (char c : name) {
    bool validChar = ('a' <= c && c <= 'z') || ('A' <= c && c <= 'Z') ||
                     ('0' <= c && c <= '9') || c == '-' || c == '.' ||
                     c == '[' || c == ']';
    if (!validChar) {
      return false;
    }
  }
  return true;
}
#  endif

bool wasm::CanonicalizeName(mozilla::Span<const char> name,
                            CacheableName* result) {
  MOZ_ASSERT(NameIsProbablyValid(name));

  // Canonicalizing names only shrinks them, so we can reserve space up front.
  UTF8Bytes buf;
  if (!buf.reserve(name.size())) {
    return false;
  }

  // Step 1: Lowercase + de-hyphenate the name.
  for (char c : name) {
    if ('A' <= c && c <= 'Z') {
      // Lowercase all letters
      buf.infallibleAppend(c + ('a' - 'A'));
    } else if (c == '-') {
      // Omit hyphens
    } else {
      buf.infallibleAppend(c);
    }
  }

  // Step 2: If the name is of the form [...]foo.foo, replace the entire name
  // with `foo`.
  intptr_t lastAttrEndIndex = -1;
  intptr_t dotIndex = -1;
  for (size_t i = 0; i < buf.length(); i++) {
    if (buf[i] == ']') {
      lastAttrEndIndex = i;
    }
    if (buf[i] == '.') {
      dotIndex = i;
    }
  }
  if (dotIndex >= 0) {
    MOZ_ASSERT(lastAttrEndIndex < dotIndex);
    mozilla::Span<char> beforeDot(&buf[lastAttrEndIndex + 1], &buf[dotIndex]);
    mozilla::Span<char> afterDot(&buf[dotIndex + 1], buf.end());
    if (beforeDot == afterDot) {
      memmove(buf.begin(), beforeDot.Elements(), beforeDot.LengthBytes());
      buf.shrinkTo(beforeDot.LengthBytes());
      *result = CacheableName(std::move(buf));
      return true;
    }
  }

  // Step 3: Strip all attributes from the name besides [constructor] and [set].
  // This is always a trim from the beginning since [constructor] must appear
  // solo and [set] must appear second.
  if (buf[0] == '[') {
    intptr_t newStartIndex = 0;
    if (buf[1] == 'm') {
      newStartIndex = strlen("[method]");
    } else if (buf[1] == 's' && buf[2] == 't') {
      newStartIndex = strlen("[static]");
    }
    if (buf[newStartIndex] == '[' && buf[newStartIndex + 1] == 'g') {
      newStartIndex += strlen("[get]");
    }
    buf.erase(buf.begin(), &buf[newStartIndex]);
  }

  *result = CacheableName(std::move(buf));
  return true;
}

bool ComponentName::getterForSetter(CacheableName* out) const {
  MOZ_RELEASE_ASSERT(attributes.contains(ComponentNameAttribute::Set));

  UTF8Bytes b;

  // Append other attributes
  if (attributes.contains(ComponentNameAttribute::Constructor) &&
      !b.append("[constructor]", strlen("[constructor]"))) {
    return false;
  }
  if (attributes.contains(ComponentNameAttribute::Method) &&
      !b.append("[method]", strlen("[method]"))) {
    return false;
  }
  if (attributes.contains(ComponentNameAttribute::Static) &&
      !b.append("[static]", strlen("[static]"))) {
    return false;
  }

  // Append [get] instead of [set]
  if (!b.append("[get]", strlen("[get]"))) {
    return false;
  }

  // Append the rest of the name
  if (!b.append(name.utf8Bytes().data() + attributesLength,
                name.utf8Bytes().size() - attributesLength)) {
    return false;
  }

  return CacheableName::fromUTF8Bytes(b, out);
}

bool StronglyUniqueNameSet::add(mozilla::Span<const char> name,
                                bool* duplicate) {
  *duplicate = false;

  CacheableName canonicalized;
  if (!CanonicalizeName(name, &canonicalized)) {
    return false;
  }

  auto p = data_.lookupForAdd(canonicalized.utf8Bytes());
  if (p) {
    *duplicate = true;
    return true;
  }
  return data_.add(p, std::move(canonicalized));
}

bool ComponentInlineExports::addExport(CacheableName&& name,
                                       ComponentSortIndex exported) {
  auto p = exports_.lookupForAdd(name.utf8Bytes());
  MOZ_RELEASE_ASSERT(!p, "duplicates should have been caught in validation");
  return exports_.add(p, std::move(name), exported);
}

bool ComponentExternDesc::compatible(const ComponentExternDesc& defined,
                                     const ComponentExternDesc& ascribed,
                                     bool isNewSubResource) {
  MOZ_ASSERT(ComponentSortValidForExternDesc(defined.sort()));
  MOZ_ASSERT(ComponentSortValidForExternDesc(ascribed.sort()));
  MOZ_RELEASE_ASSERT(defined.isValid() && ascribed.isValid());

  // Different sorts never match.
  if (defined.sort() != ascribed.sort()) {
    return false;
  }

  switch (defined.sort()) {
    case ComponentSort::Func:
      return defined.asFunc() == ascribed.asFunc();
    case ComponentSort::Type: {
      ComponentType definedType = defined.asType();
      ComponentType ascribedType = ascribed.asType();
      if (ascribedType.kind() == ComponentTypeKind::SubResource &&
          isNewSubResource) {
        return definedType.kind() == ComponentTypeKind::Resource ||
               definedType.kind() == ComponentTypeKind::SubResource;
      }
      return defined.asType() == ascribed.asType();
    }
    case ComponentSort::Component:
    case ComponentSort::Instance:
    case ComponentSort::CoreModule: {
      // TODO(wasm-cm)
      return false;
    } break;
    default:
      MOZ_CRASH("all valid sorts for externdesc should have been handled");
  }
}

bool ComponentType::record(ComponentRecordFieldVector&& fields,
                           ComponentType* type) {
  ComponentTypeDef* def =
      js_new<ComponentTypeDef>(ComponentTypeSchema(std::move(fields)));
  if (!def) {
    return false;
  }
  *type = ComponentType(ComponentTypeKind::Record, def);
  return true;
}

bool ComponentType::variant(ComponentVariantCaseVector&& cases,
                            ComponentType* type) {
  ComponentTypeDef* def =
      js_new<ComponentTypeDef>(ComponentTypeSchema(std::move(cases)));
  if (!def) {
    return false;
  }
  *type = ComponentType(ComponentTypeKind::Variant, def);
  return true;
}

bool ComponentType::list(ComponentType&& elemType, ComponentType* type) {
  ComponentTypeDef* def =
      js_new<ComponentTypeDef>(ComponentTypeSchema(std::move(elemType)));
  if (!def) {
    return false;
  }
  *type = ComponentType(ComponentTypeKind::List, def);
  return true;
}

bool ComponentType::tuple(ComponentTypeVector&& items, ComponentType* type) {
  ComponentTypeDef* def =
      js_new<ComponentTypeDef>(ComponentTypeSchema(std::move(items)));
  if (!def) {
    return false;
  }
  *type = ComponentType(ComponentTypeKind::Tuple, def);
  return true;
}

bool ComponentType::flags(CacheableNameVector&& labels, ComponentType* type) {
  ComponentTypeDef* def =
      js_new<ComponentTypeDef>(ComponentTypeSchema(std::move(labels)));
  if (!def) {
    return false;
  }
  *type = ComponentType(ComponentTypeKind::Flags, def);
  return true;
}

bool ComponentType::enum_(CacheableNameVector&& cases, ComponentType* type) {
  ComponentTypeDef* def =
      js_new<ComponentTypeDef>(ComponentTypeSchema(std::move(cases)));
  if (!def) {
    return false;
  }
  *type = ComponentType(ComponentTypeKind::Enum, def);
  return true;
}

bool ComponentType::option(ComponentType&& inner, ComponentType* type) {
  ComponentTypeDef* def =
      js_new<ComponentTypeDef>(ComponentTypeSchema(std::move(inner)));
  if (!def) {
    return false;
  }
  *type = ComponentType(ComponentTypeKind::Option, def);
  return true;
}

bool ComponentType::result(ComponentResultType&& inner, ComponentType* type) {
  ComponentTypeDef* def =
      js_new<ComponentTypeDef>(ComponentTypeSchema(std::move(inner)));
  if (!def) {
    return false;
  }
  *type = ComponentType(ComponentTypeKind::Result, def);
  return true;
}

bool ComponentType::own(ComponentType&& inner, ComponentType* type) {
  ComponentTypeDef* def =
      js_new<ComponentTypeDef>(ComponentTypeSchema(std::move(inner)));
  if (!def) {
    return false;
  }
  *type = ComponentType(ComponentTypeKind::Own, def);
  return true;
}

bool ComponentType::borrow(ComponentType&& inner, ComponentType* type) {
  ComponentTypeDef* def =
      js_new<ComponentTypeDef>(ComponentTypeSchema(std::move(inner)));
  if (!def) {
    return false;
  }
  *type = ComponentType(ComponentTypeKind::Borrow, def);
  return true;
}

bool ComponentType::func(ComponentFuncType&& inner, ComponentType* type) {
  ComponentTypeDef* def =
      js_new<ComponentTypeDef>(ComponentTypeSchema(std::move(inner)));
  if (!def) {
    return false;
  }
  *type = ComponentType(ComponentTypeKind::Func, def);
  return true;
}

bool ComponentType::resource(ComponentResourceType&& inner,
                             ComponentType* type) {
  ComponentTypeDef* def =
      js_new<ComponentTypeDef>(ComponentTypeSchema(std::move(inner)));
  if (!def) {
    return false;
  }
  *type = ComponentType(ComponentTypeKind::Resource, def);
  return true;
}

bool ComponentType::subResource(ComponentType* type) {
  // We still need a unique heap allocation so that two (sub resource) types
  // will not be equal.
  ComponentTypeDef* def =
      js_new<ComponentTypeDef>(ComponentTypeSchema(mozilla::Nothing()));
  if (!def) {
    return false;
  }
  *type = ComponentType(ComponentTypeKind::SubResource, def);
  return true;
}

const ComponentRecordFieldVector& ComponentType::asRecord() const {
  MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Record);
  return typeDef_->schema().as<ComponentRecordFieldVector>();
}

const ComponentVariantCaseVector& ComponentType::asVariant() const {
  MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Variant);
  return typeDef_->schema().as<ComponentVariantCaseVector>();
}

ComponentType ComponentType::asList() const {
  MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::List);
  return typeDef_->schema().as<ComponentType>();
}

const ComponentTypeVector& ComponentType::asTuple() const {
  MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Tuple);
  return typeDef_->schema().as<ComponentTypeVector>();
}

const CacheableNameVector& ComponentType::asFlags() const {
  MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Flags);
  return typeDef_->schema().as<CacheableNameVector>();
}

const CacheableNameVector& ComponentType::asEnum() const {
  MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Enum);
  return typeDef_->schema().as<CacheableNameVector>();
}

ComponentType ComponentType::asOption() const {
  MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Option);
  return typeDef_->schema().as<ComponentType>();
}

ComponentResultType ComponentType::asResult() const {
  MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Result);
  return typeDef_->schema().as<ComponentResultType>();
}

ComponentType ComponentType::asOwn() const {
  MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Own);
  return typeDef_->schema().as<ComponentType>();
}

ComponentType ComponentType::asBorrow() const {
  MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Borrow);
  return typeDef_->schema().as<ComponentType>();
}

const ComponentFuncType& ComponentType::asFunc() const {
  MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Func);
  return typeDef_->schema().as<ComponentFuncType>();
}

const ComponentResourceType& ComponentType::asResource() const {
  MOZ_RELEASE_ASSERT(kind() == ComponentTypeKind::Resource);
  return typeDef_->schema().as<ComponentResourceType>();
}

bool ComponentType::structurallyEqual(const ComponentType& a,
                                      const ComponentType& b) {
  return a.kind() == b.kind() &&
         ComponentTypeDef::structurallyEqual(*a.typeDef_, *b.typeDef_);
}

bool ComponentTypeDef::structurallyEqual(const ComponentTypeDef& a,
                                         const ComponentTypeDef& b) {
  return a.schema().match(
      [&](const mozilla::Nothing&) {
        return b.schema().is<mozilla::Nothing>();
      },
      [&](const ComponentType& aType) {
        if (!b.schema().is<ComponentType>()) {
          return false;
        }
        const ComponentType& bType = b.schema().as<ComponentType>();
        return aType == bType;
      },
      [&](const ComponentRecordFieldVector& aFields) {
        if (!b.schema().is<ComponentRecordFieldVector>()) {
          return false;
        }
        const ComponentRecordFieldVector& bFields =
            b.schema().as<ComponentRecordFieldVector>();

        if (aFields.length() != bFields.length()) {
          return false;
        }
        for (size_t i = 0; i < aFields.length(); i++) {
          if (aFields[i] != bFields[i]) {
            return false;
          }
        }
        return true;
      },
      [&](const ComponentVariantCaseVector& aCases) {
        if (!b.schema().is<ComponentVariantCaseVector>()) {
          return false;
        }
        const ComponentVariantCaseVector& bCases =
            b.schema().as<ComponentVariantCaseVector>();

        if (aCases.length() != bCases.length()) {
          return false;
        }
        for (size_t i = 0; i < aCases.length(); i++) {
          if (aCases[i] != bCases[i]) {
            return false;
          }
        }
        return true;
      },
      [&](const ComponentTypeVector& aTypes) {
        if (!b.schema().is<ComponentTypeVector>()) {
          return false;
        }
        const ComponentTypeVector& bTypes =
            b.schema().as<ComponentTypeVector>();

        if (aTypes.length() != bTypes.length()) {
          return false;
        }
        for (size_t i = 0; i < aTypes.length(); i++) {
          if (aTypes[i] != bTypes[i]) {
            return false;
          }
        }
        return true;
      },
      [&](const CacheableNameVector& aLabels) {
        if (!b.schema().is<CacheableNameVector>()) {
          return false;
        }
        const CacheableNameVector& bLabels =
            b.schema().as<CacheableNameVector>();

        if (aLabels.length() != bLabels.length()) {
          return false;
        }
        for (size_t i = 0; i < aLabels.length(); i++) {
          if (aLabels[i] != bLabels[i]) {
            return false;
          }
        }
        return true;
      },
      [&](const ComponentResultType& aResult) {
        if (!b.schema().is<ComponentResultType>()) {
          return false;
        }
        const ComponentResultType& bResult =
            b.schema().as<ComponentResultType>();
        return ComponentResultType::equals(aResult, bResult);
      },
      [&](const ComponentFuncType& aFunc) {
        if (!b.schema().is<ComponentFuncType>()) {
          return false;
        }
        const ComponentFuncType& bFunc = b.schema().as<ComponentFuncType>();
        return aFunc == bFunc;
      },
      [&](const ComponentResourceType& a) {
        // This method never considers resource types to be equal because this
        // is the wrong place to check for that kind of equality. Two
        // canonicalized ComponentTypes for resource types may be equal, because
        // they point at the same ComponentTypeDef (by pointer equality), but
        // this method has no concept of that.
        return false;
      });
}

[[nodiscard]] static HashNumber AddComponentTypeToHash(HashNumber hash,
                                                       ComponentType type) {
  hash = mozilla::AddToHash(hash, type.kind());
  hash = mozilla::AddToHash(hash, type.typeDef().get());
  return hash;
}

[[nodiscard]] static HashNumber AddMaybeComponentTypeToHash(
    HashNumber hash, mozilla::Maybe<ComponentType> type) {
  hash = mozilla::AddToHash(hash, type.isSome());
  if (type.isSome()) {
    hash = AddComponentTypeToHash(hash, *type);
  }
  return hash;
}

static HashNumber HashName(const CacheableName& name) {
  return mozilla::HashString(name.utf8Bytes().data(),
                             name.utf8Bytes().Length());
}

HashNumber ComponentTypeHasher::hash(const ComponentType& t) {
  HashNumber hash = 0;
  hash = mozilla::AddToHash(hash, t.kind());

  // Primitives and resource types should not appear here; this is caught by the
  // default case.
  switch (t.kind()) {
    case ComponentTypeKind::Record: {
      const ComponentRecordFieldVector& fields = t.asRecord();
      for (const ComponentRecordField& f : fields) {
        hash = mozilla::AddToHash(hash, HashName(f.name));
        hash = AddComponentTypeToHash(hash, f.type);
      }
    } break;
    case ComponentTypeKind::Variant: {
      const ComponentVariantCaseVector& cases = t.asVariant();
      for (const ComponentVariantCase& c : cases) {
        hash = mozilla::AddToHash(hash, HashName(c.name));
        hash = AddMaybeComponentTypeToHash(hash, c.type);
      }
    } break;
    case ComponentTypeKind::List: {
      hash = AddComponentTypeToHash(hash, t.asList());
    } break;
    case ComponentTypeKind::Tuple: {
      const ComponentTypeVector& types = t.asTuple();
      for (const ComponentType& t : types) {
        hash = AddComponentTypeToHash(hash, t);
      }
    } break;
    case ComponentTypeKind::Flags: {
      const CacheableNameVector& labels = t.asFlags();
      for (const CacheableName& label : labels) {
        hash = mozilla::AddToHash(hash, HashName(label));
      }
    } break;
    case ComponentTypeKind::Enum: {
      const CacheableNameVector& cases = t.asEnum();
      for (const CacheableName& c : cases) {
        hash = mozilla::AddToHash(hash, HashName(c));
      }
    } break;
    case ComponentTypeKind::Option: {
      hash = AddComponentTypeToHash(hash, t.asOption());
    } break;
    case ComponentTypeKind::Result: {
      const ComponentResultType& rt = t.asResult();
      hash = AddMaybeComponentTypeToHash(hash, rt.type);
      hash = AddMaybeComponentTypeToHash(hash, rt.errorType);
    } break;
    case ComponentTypeKind::Own: {
      hash = AddComponentTypeToHash(hash, t.asOwn());
    } break;
    case ComponentTypeKind::Borrow: {
      hash = AddComponentTypeToHash(hash, t.asBorrow());
    } break;
    case ComponentTypeKind::Func: {
      const ComponentFuncType& ft = t.asFunc();
      MOZ_ASSERT(ft.paramTypes.length() == ft.paramNames.length());
      for (size_t i = 0; i < ft.paramTypes.length(); i++) {
        hash = mozilla::AddToHash(hash, HashName(ft.paramNames[i]));
        hash = AddComponentTypeToHash(hash, ft.paramTypes[i]);
      }
      hash = AddMaybeComponentTypeToHash(hash, ft.resultType);
    } break;
    case ComponentTypeKind::Component:
    case ComponentTypeKind::Instance:
      // TODO(wasm-cm): Component and instance types not yet implemented
      MOZ_CRASH();
    default:
      MOZ_CRASH("should have been excluded from hashing");
  }

  return hash;
}
bool ComponentTypeHasher::match(const ComponentType& a,
                                const ComponentType& b) {
  // (eq i) bounds should be resolved to a unique type on type construction.
  MOZ_ASSERT(a.kind() != ComponentTypeKind::Eq);
  MOZ_ASSERT(b.kind() != ComponentTypeKind::Eq);

  // Primitives and resource types should be special-cased during
  // canonicalization and should therefore never end up here.
  MOZ_ASSERT(!ComponentTypeKindIsPrimitive(a.kind()) &&
             a.kind() != ComponentTypeKind::Resource &&
             a.kind() != ComponentTypeKind::SubResource);
  MOZ_ASSERT(!ComponentTypeKindIsPrimitive(b.kind()) &&
             b.kind() != ComponentTypeKind::Resource &&
             b.kind() != ComponentTypeKind::SubResource);

  return ComponentType::structurallyEqual(a, b);
}

bool ComponentCanonicalTypeSet::canonicalize(const ComponentType& type,
                                             ComponentType* canonicalized) {
  MOZ_RELEASE_ASSERT(type.isValid());

  // Primitives compare trivially and require no additional storage, therefore
  // they do not need to be explicitly stored.
  if (ComponentTypeKindIsPrimitive(type.kind())) {
    MOZ_RELEASE_ASSERT(!type.typeDef());
    *canonicalized = type;
    return true;
  }
  MOZ_RELEASE_ASSERT(type.typeDef());

  // Resource types retain their uniqueness by skipping canonicalization.
  if (type.kind() == ComponentTypeKind::Resource ||
      type.kind() == ComponentTypeKind::SubResource) {
    *canonicalized = type;
    return true;
  }

  // All other types are hashed and deduplicated structurally. As long as all
  // types are canonicalized as they are parsed, this means that pointer
  // equality of a type's ComponentTypeDef is equivalent to structural equality.
  auto addPtr = canonicalTypes_.lookupForAdd(type);
  if (addPtr) {
    *canonicalized = *addPtr;
    return true;
  }
  if (!canonicalTypes_.add(addPtr, type)) {
    return false;
  }
  *canonicalized = type;
  return true;
}

MOZ_RUNINIT static ExclusiveData<ComponentCanonicalTypeSet>
    sComponentCanonicalTypeSet(mutexid::WasmComponentCanonicalTypeSet);

bool wasm::CanonicalizeComponentType(const ComponentType& type,
                                     ComponentType* canonicalized) {
  ExclusiveData<ComponentCanonicalTypeSet>::Guard locked =
      sComponentCanonicalTypeSet.lock();
  return locked->canonicalize(type, canonicalized);
}

void wasm::PurgeComponentCanonicalTypes() {
  ExclusiveData<ComponentCanonicalTypeSet>::Guard locked =
      sComponentCanonicalTypeSet.lock();
  locked->canonicalTypes_.clearAndCompact();
}

mozilla::Maybe<FuncType> wasm::FlattenFuncType(
    const ComponentFuncType& funcType, CanonMode mode, bool* memoryRequired,
    bool* reallocRequired, bool* tooDeep) {
  const uint32_t MaxFlatParams = 16;
  const uint32_t MaxFlatResults = 1;

  ValTypeVector params;
  ValTypeVector results;

  bool paramsHaveStringsOrLists = false;
  bool resultsHaveStringsOrLists = false;
  if (!FlattenTypes(funcType.paramTypes, &params, &paramsHaveStringsOrLists,
                    tooDeep, /*depth=*/0)) {
    return mozilla::Nothing();
  }
  if (funcType.resultType.isSome()) {
    if (!FlattenType(funcType.resultType.ref(), &results,
                     &resultsHaveStringsOrLists, tooDeep, /*depth=*/0)) {
      return mozilla::Nothing();
    }
  }

  // String or list params require realloc on lift and memory on lower.
  // String or list results require memory on lift and realloc on lower.
  if ((mode == CanonMode::Lift && resultsHaveStringsOrLists) ||
      (mode == CanonMode::Lower && paramsHaveStringsOrLists)) {
    *memoryRequired = true;
  }
  if ((mode == CanonMode::Lift && paramsHaveStringsOrLists) ||
      (mode == CanonMode::Lower && resultsHaveStringsOrLists)) {
    *reallocRequired = true;
  }

  // Regardless of lifting or lowering, if there are too many flattened params,
  // values must be passed in memory. Replace the params with a single pointer
  // to memory.
  if (params.length() > MaxFlatParams) {
    params.clear();
    if (!params.append(ValType::i32())) {
      return mozilla::Nothing();
    }

    // Spilled params must be alloced by the host on lifted functions, whereas
    // on lowered functions they are allocated by the module and read by the
    // host.
    if (mode == CanonMode::Lift) {
      *reallocRequired = true;
    } else {
      *memoryRequired = true;
    }
  }

  // If there are too many flattened results (e.g. returning a record), the
  // results must also be passed in memory. When lifting a core func, the core
  // module does the obvious thing and allocates space for the results,
  // returning a pointer. When lowering a component func, however, returning a
  // pointer would imply that the component callee has to call `realloc` to get
  // such a pointer, which is dumb when the core caller could just allocate
  // stack space for it, so instead the canonical ABI chooses to make the
  // results an out param.
  if (results.length() > MaxFlatResults) {
    if (mode == CanonMode::Lift) {
      results.clear();
      if (!results.append(ValType::i32())) {
        return mozilla::Nothing();
      }
    } else {
      if (!params.append(ValType::i32())) {
        return mozilla::Nothing();
      }
      results.clear();
    }

    *memoryRequired = true;
  }

  // If realloc is required, memory is always also required.
  if (*reallocRequired) {
    *memoryRequired = true;
  }

  return mozilla::Some(FuncType(std::move(params), std::move(results)));
}

bool wasm::FlattenTypes(const ComponentTypeVector& types, ValTypeVector* result,
                        bool* hasStringsOrLists, bool* tooDeep,
                        uint32_t depth) {
  // Pre-reserve at least enough space for a bunch of primitives. We still may
  // exceed the capacity reserved here but at least we can avoid a little bit of
  // allocation. (Appends after this point are not to be considered infallible.)
  if (!result->reserve(types.length())) {
    return false;
  }

  for (const ComponentType& t : types) {
    if (!FlattenType(t, result, hasStringsOrLists, tooDeep, depth)) {
      return false;
    }
  }

  return true;
}

static ValType JoinVariantValType(ValType a, ValType b) {
  MOZ_ASSERT(a.isNumber() && b.isNumber());
  if (a == b) {
    return a;
  } else if ((a == ValType::i32() && b == ValType::f32()) ||
             (a == ValType::f32() && b == ValType::i32())) {
    return ValType::i32();
  } else {
    return ValType::i64();
  }
}

bool wasm::FlattenType(const ComponentType& type, ValTypeVector* result,
                       bool* hasStringsOrLists, bool* tooDeep, uint32_t depth) {
  if (depth > MaxComponentFlatteningDepth) {
    *tooDeep = true;
    return false;
  }
  depth += 1;

  switch (type.kind()) {
    // Simple primitives
    case ComponentTypeKind::Bool:
    case ComponentTypeKind::U8:
    case ComponentTypeKind::U16:
    case ComponentTypeKind::U32:
    case ComponentTypeKind::S8:
    case ComponentTypeKind::S16:
    case ComponentTypeKind::S32:
    case ComponentTypeKind::Char:
    case ComponentTypeKind::Flags:
    case ComponentTypeKind::Enum:
    case ComponentTypeKind::Own:
    case ComponentTypeKind::Borrow: {
      if (!result->append(ValType::i32())) {
        return false;
      }
    } break;
    case ComponentTypeKind::U64:
    case ComponentTypeKind::S64: {
      if (!result->append(ValType::i64())) {
        return false;
      }
    } break;
    case ComponentTypeKind::F32: {
      if (!result->append(ValType::f32())) {
        return false;
      }
    } break;
    case ComponentTypeKind::F64: {
      if (!result->append(ValType::f64())) {
        return false;
      }
    } break;

    // Strings are always two i32's
    case ComponentTypeKind::String: {
      *hasStringsOrLists = true;
      if (!result->append(ValType::i32())) {
        return false;
      }
      if (!result->append(ValType::i32())) {
        return false;
      }
    } break;

    // Compound types have dedicated logic. Note that our data storage for some
    // types disagrees with the categories in the canonical ABI explainer, e.g.
    // we represent tuples as a vector of value types, not a record.
    case ComponentTypeKind::List: {
      *hasStringsOrLists = true;
      // This will have to change when support is added for fixed-length lists.
      if (!result->append(ValType::i32())) {
        return false;
      }
      if (!result->append(ValType::i32())) {
        return false;
      }
    } break;
    case ComponentTypeKind::Record: {
      if (!FlattenRecord(type.asRecord(), result, hasStringsOrLists, tooDeep,
                         depth)) {
        return false;
      }
    } break;
    case ComponentTypeKind::Tuple: {
      if (!FlattenTypes(type.asTuple(), result, hasStringsOrLists, tooDeep,
                        depth)) {
        return false;
      }
    } break;
    case ComponentTypeKind::Variant: {
      // Flatten the discriminant
      if (!result->append(ValType::i32())) {
        return false;
      }

      // Flatten all the cases (overlapped, with joins)
      const ComponentVariantCaseVector& cases = type.asVariant();
      size_t startIndex = result->length();
      for (const ComponentVariantCase& case_ : cases) {
        if (!case_.type) {
          continue;
        }

        ValTypeVector caseFlattened;
        if (!FlattenType(*case_.type, &caseFlattened, hasStringsOrLists,
                         tooDeep, depth)) {
          return false;
        }
        for (size_t i = 0; i < caseFlattened.length(); i++) {
          size_t existingIndex = startIndex + i;
          if (existingIndex < result->length()) {
            // Join the new type with the existing one.
            (*result)[existingIndex] =
                JoinVariantValType((*result)[existingIndex], caseFlattened[i]);
          } else {
            // Append the new type to the overall list.
            if (!result->append(caseFlattened[i])) {
              return false;
            }
          }
        }
      }
    } break;
    case ComponentTypeKind::Option: {
      ComponentType inner = type.asOption();
      if (!result->append(ValType::i32())) {
        return false;
      }
      if (!FlattenType(inner, result, hasStringsOrLists, tooDeep, depth)) {
        return false;
      }
    } break;
    case ComponentTypeKind::Result: {
      ComponentResultType inner = type.asResult();
      // Result types are encoded just like a variant with two cases, but each
      // case may or may not have a type.

      // Discriminant
      if (!result->append(ValType::i32())) {
        return false;
      }

      // Payload(s)
      size_t startIndex = result->length();
      if (inner.type.isSome()) {
        if (!FlattenType(*inner.type, result, hasStringsOrLists, tooDeep,
                         depth)) {
          return false;
        }
      }
      if (inner.errorType.isSome()) {
        ValTypeVector errorFlattened;
        if (!FlattenType(*inner.errorType, &errorFlattened, hasStringsOrLists,
                         tooDeep, depth)) {
          return false;
        }
        for (size_t i = 0; i < errorFlattened.length(); i++) {
          size_t existingIndex = startIndex + i;
          if (existingIndex < result->length()) {
            (*result)[existingIndex] =
                JoinVariantValType((*result)[existingIndex], errorFlattened[i]);
          } else {
            if (!result->append(errorFlattened[i])) {
              return false;
            }
          }
        }
      }
    } break;

    default:
      MOZ_CRASH("should have been rejected when the func type was validated");
  }

  return true;
}

bool wasm::FlattenRecord(const ComponentRecordFieldVector& fields,
                         ValTypeVector* result, bool* hasStringsOrLists,
                         bool* tooDeep, uint32_t depth) {
  for (const ComponentRecordField& field : fields) {
    if (!FlattenType(field.type, result, hasStringsOrLists, tooDeep, depth)) {
      return false;
    }
  }

  return true;
}

/* virtual */
JSObject* Component::createObject(JSContext* cx) const {
  if (!GlobalObject::ensureConstructor(cx, cx->global(), JSProto_WebAssembly)) {
    return nullptr;
  }

  JS::RootedVector<JSString*> parameterStrings(cx);
  JS::RootedVector<Value> parameterArgs(cx);
  bool canCompileStrings = false;
  if (!cx->isRuntimeCodeGenEnabled(JS::RuntimeCode::WASM, nullptr,
                                   JS::CompilationType::Undefined,
                                   parameterStrings, nullptr, parameterArgs,
                                   NullHandleValue, &canCompileStrings)) {
    return nullptr;
  }
  if (!canCompileStrings) {
    JS_ReportErrorNumberASCII(cx, GetErrorMessage, nullptr,
                              JSMSG_CSP_BLOCKED_WASM, "WebAssembly.Component");
    return nullptr;
  }

  RootedObject proto(cx, &cx->global()->getPrototype(JSProto_WasmComponent));
  return WasmComponentObject::create(cx, *this, proto);
}

bool Component::hasImportWithName(mozilla::Span<const char> name) const {
  auto p = importsByName_.lookup(name);
  return p.found();
}

const ComponentImport& Component::getImportByName(
    mozilla::Span<const char> name) const {
  auto p = importsByName_.lookup(name);
  MOZ_RELEASE_ASSERT(p.found());
  return imports_[p->value()];
}

bool Component::addImport(ComponentImport&& import) {
  ComponentSort sort = import.externDesc().sort();
  MOZ_ASSERT(ComponentSortValidForExternDesc(sort));

  // Add import to imports vector
  uint32_t importIndex = imports_.length();
  if (!imports_.append(std::move(import))) {
    return false;
  }

  // Add import to hash map
  mozilla::Span<const char> savedImportName =
      imports_[importIndex].name().name.utf8Bytes();
  auto p = importsByName_.lookupForAdd(savedImportName);
  MOZ_RELEASE_ASSERT(!p.found());
  if (!importsByName_.add(p, savedImportName, importIndex)) {
    return false;
  }

  // Add import to appropriate index space
  ComponentItem item = ComponentItem::import(sort, importIndex);
  switch (sort) {
    case ComponentSort::Func: {
      if (!funcs_.append(item)) {
        return false;
      }
    } break;
    case ComponentSort::Type: {
      if (!types_.append(item)) {
        return false;
      }
    } break;
    case ComponentSort::Component: {
      if (!components_.append(item)) {
        return false;
      }
    } break;
    case ComponentSort::Instance: {
      if (!instances_.append(item)) {
        return false;
      }
    } break;
    case ComponentSort::CoreModule: {
      if (!coreModules_.append(item)) {
        return false;
      }
    } break;
    default:
      MOZ_CRASH();
  }

  return true;
}

bool Component::hasExportWithName(mozilla::Span<const char> name) const {
  auto p = exportsByName_.lookup(name);
  return p.found();
}

const ComponentExport& Component::getExportByName(
    mozilla::Span<const char> name) const {
  auto p = exportsByName_.lookup(name);
  MOZ_RELEASE_ASSERT(p.found());
  return exports_[p->value()];
}

bool Component::addExport(ComponentExport&& exp) {
  ComponentSort sort = exp.externDesc().sort();
  MOZ_ASSERT(ComponentSortValidForExternDesc(sort));

  // Add export to exports vector
  uint32_t exportIndex = exports_.length();
  if (!exports_.append(std::move(exp))) {
    return false;
  }

  // Add export to hash map
  mozilla::Span<const char> savedExportName =
      exports_[exportIndex].name().name.utf8Bytes();
  auto p = exportsByName_.lookupForAdd(savedExportName);
  MOZ_RELEASE_ASSERT(!p.found());
  if (!exportsByName_.add(p, savedExportName, exportIndex)) {
    return false;
  }

  // Add export to appropriate index space
  ComponentItem item = ComponentItem::export_(sort, exportIndex);
  switch (sort) {
    case ComponentSort::Func: {
      if (!funcs_.append(item)) {
        return false;
      }
    } break;
    case ComponentSort::Type: {
      if (!types_.append(item)) {
        return false;
      }
    } break;
    case ComponentSort::Component: {
      if (!components_.append(item)) {
        return false;
      }
    } break;
    case ComponentSort::Instance: {
      if (!instances_.append(item)) {
        return false;
      }
    } break;
    case ComponentSort::CoreModule: {
      if (!coreModules_.append(item)) {
        return false;
      }
    } break;
    default:
      MOZ_CRASH();
  }

  return true;
}

ComponentType Component::getType(uint32_t typeIndex) const {
  ComponentItem item = types_[typeIndex];
  MOZ_ASSERT(item.sort() == ComponentSort::Type);
  switch (item.kind()) {
    case ComponentItem::ItemKind::Defined:
      return definedTypes_[item.itemIndex()];
    case ComponentItem::ItemKind::Import:
      return imports_[item.itemIndex()].externDesc().asType();
    case ComponentItem::ItemKind::Export:
      return exports_[item.itemIndex()].externDesc().asType();
    case ComponentItem::ItemKind::Alias:
      MOZ_CRASH("should be impossible for now");
    default:
      MOZ_CRASH();
  }
}

ComponentType Component::getTypeForFunc(uint32_t funcIndex) const {
  ComponentItem item = funcs_[funcIndex];
  MOZ_ASSERT(item.sort() == ComponentSort::Func);
  switch (item.kind()) {
    case ComponentItem::ItemKind::Defined:
      return getType(definedFuncs_[item.itemIndex()].typeIndex());
    case ComponentItem::ItemKind::Import:
      return imports_[item.itemIndex()].externDesc().asFunc();
    case ComponentItem::ItemKind::Export:
      return exports_[item.itemIndex()].externDesc().asFunc();
    case ComponentItem::ItemKind::Alias:
      MOZ_CRASH("should be impossible for now");
    default:
      MOZ_CRASH();
  }
}

const TypeDef& Component::getTypeForCoreFunc(uint32_t coreFuncIndex) const {
  ComponentItem item = coreFuncs_[coreFuncIndex];
  MOZ_ASSERT(item.sort() == ComponentSort::CoreFunction);
  switch (item.kind()) {
    case ComponentItem::ItemKind::Defined:
      return *definedCoreFuncs_[item.itemIndex()].coreFuncType();
    case ComponentItem::ItemKind::Import:
    case ComponentItem::ItemKind::Export:
      // Core funcs cannot be imported or exported.
      MOZ_CRASH();
    case ComponentItem::ItemKind::Alias: {
      if (item.aliasKind() == ComponentAliasKind::Outer) {
        // TODO(wasm-cm): Right now we should only produce outer aliases with
        // an index of 0. In the future this will need to be expanded to
        // handle all outer aliases.
        //
        // TODO(wasm-cm): Well, but is it ever valid to outer-alias a core
        // thing (other than a module) with a depth other than 0? Probably
        // not.
        MOZ_RELEASE_ASSERT(item.aliasInstanceIndex() == 0);
        return getTypeForCoreFunc(item.itemIndex());
      }
      return getCoreExportAliasType(
                 ComponentSortIndex(ComponentSort::CoreFunction, coreFuncIndex))
          .asFunc();
    } break;
    default:
      MOZ_CRASH();
  }
}

CoreExternType Component::getCoreItemType(ComponentSortIndex sortIndex) const {
  if (sortIndex.sort == ComponentSort::CoreFunction) {
    return CoreExternType::func(getTypeForCoreFunc(sortIndex.index));
  }
  return getCoreExportAliasType(sortIndex);
}

const CoreExternType& Component::getCoreExportAliasType(
    ComponentSortIndex sortIndex) const {
  ComponentItem item = resolveSortIndex(sortIndex);
  MOZ_RELEASE_ASSERT(item.kind() == ComponentItem::ItemKind::Alias);
  MOZ_RELEASE_ASSERT(item.aliasKind() == ComponentAliasKind::CoreExport);
  return *getCoreInstance(item.aliasInstanceIndex())
              .type()
              .getExport(coreExportAliasName(item));
}

const Component::ItemVector& Component::coreIndexSpace(
    ComponentSort sort) const {
  switch (sort) {
    case ComponentSort::CoreFunction:
      return coreFuncs_;
    case ComponentSort::CoreTable:
      return coreTables_;
    case ComponentSort::CoreMemory:
      return coreMemories_;
    case ComponentSort::CoreGlobal:
      return coreGlobals_;
    case ComponentSort::CoreTag:
      return coreTags_;
    default:
      MOZ_CRASH();
  }
}

bool Component::addCoreModule(SharedModule module) {
  SharedCoreModuleType type;
  if (!module->moduleMeta().buildModuleType(&type) ||
      !definedCoreModuleTypes_.append(std::move(type))) {
    return false;
  }
  return addDefinedItem(ComponentSort::CoreModule, std::move(module),
                        definedCoreModules_, coreModules_);
}

SharedModule Component::getCoreModule(uint32_t modIndex) const {
  return definedCoreModules_[definedCoreModuleIndex(modIndex)];
}

const CoreModuleType& Component::getCoreModuleType(uint32_t modIndex) const {
  return *definedCoreModuleTypes_[definedCoreModuleIndex(modIndex)];
}

uint32_t Component::definedCoreModuleIndex(uint32_t modIndex) const {
  ComponentItem item = coreModules_[modIndex];
  MOZ_ASSERT(item.sort() == ComponentSort::CoreModule);
  switch (item.kind()) {
    case ComponentItem::ItemKind::Defined:
      return item.itemIndex();
    case ComponentItem::ItemKind::Import:
      // TODO(wasm-cm): Fix when core module types are supported
      MOZ_CRASH("should be impossible for now");
    case ComponentItem::ItemKind::Export: {
      const ComponentExport& exp = exports_[item.itemIndex()];
      MOZ_ASSERT(exp.externDesc().sort() == ComponentSort::CoreModule);
      return exp.externDesc().asCoreModule();
    } break;
    case ComponentItem::ItemKind::Alias:
      // TODO(wasm-cm): Fix when nested components are supported
      MOZ_CRASH("should be impossible for now");
    default:
      MOZ_CRASH();
  }
}

const CoreInstanceDesc& Component::getCoreInstance(
    uint32_t instanceIndex) const {
  ComponentItem item = coreInstances_[instanceIndex];
  MOZ_ASSERT(item.sort() == ComponentSort::CoreInstance);
  switch (item.kind()) {
    case ComponentItem::ItemKind::Defined:
      return definedCoreInstances_[item.itemIndex()];
    case ComponentItem::ItemKind::Import:
    case ComponentItem::ItemKind::Export:
    case ComponentItem::ItemKind::Alias:
      // Core instances cannot be imported or exported, and because of this,
      // they cannot be aliased either.
      MOZ_CRASH();
    default:
      MOZ_CRASH();
  }
}

ComponentItem Component::resolveSortIndex(ComponentSortIndex sortIndex) const {
  switch (sortIndex.sort) {
    case ComponentSort::Func:
      return funcs_[sortIndex.index];
    case ComponentSort::Type:
      return types_[sortIndex.index];
    case ComponentSort::Component:
    case ComponentSort::Instance:
      // TODO(wasm-cm): Nested components
      MOZ_CRASH();

    case ComponentSort::CoreFunction:
      return coreFuncs_[sortIndex.index];
    case ComponentSort::CoreTable:
      return coreTables_[sortIndex.index];
    case ComponentSort::CoreMemory:
      return coreMemories_[sortIndex.index];
    case ComponentSort::CoreGlobal:
      return coreGlobals_[sortIndex.index];
    case ComponentSort::CoreTag:
      return coreTags_[sortIndex.index];

    case ComponentSort::CoreType:
      return coreTypes_[sortIndex.index];
    case ComponentSort::CoreModule:
      return coreModules_[sortIndex.index];
    case ComponentSort::CoreInstance:
      return coreInstances_[sortIndex.index];

    default:
      MOZ_CRASH();
  }
}

bool Component::instantiate(
    JSContext* cx, HandleObject instanceProto,
    MutableHandle<WasmComponentInstanceObject*> instance) const {
  instance.set(WasmComponentInstanceObject::create(cx, instanceProto, this));
  if (!instance) {
    return false;
  }

  return true;
}

ComponentInstance::ComponentInstance(
    JSContext* cx, Handle<WasmComponentInstanceObject*> object,
    const SharedComponent component)
    : realm_(cx->realm()), cx_(cx), component_(component) {}

ComponentInstance::~ComponentInstance() = default;

ComponentInstance* ComponentInstance::create(
    JSContext* cx, Handle<WasmComponentInstanceObject*> object,
    const SharedComponent component) {
  ComponentInstance* instance =
      js_new<ComponentInstance>(cx, object, component);
  if (!instance) {
    ReportOutOfMemory(cx);
    return nullptr;
  }
  return instance;
}

void ComponentInstance::destroy(ComponentInstance* instance) {
  instance->~ComponentInstance();
  js_free(instance);
}

void ComponentInstance::tracePrivate(JSTracer* trc) {
  coreInstanceExports_.trace(trc);
}

// Gets a named property from a plain object. The actual GetProperty call is
// expected to be infallible due to previous validation.
[[nodiscard]] static bool GetValidatedNamedPropertyFromObject(
    JSContext* cx, HandleObject obj, const CacheableName& name,
    MutableHandleValue exportVal) {
  JSAtom* atom = name.toAtom(cx);
  if (!atom) {
    return false;
  }
  RootedId id(cx, AtomToId(atom));
  MOZ_RELEASE_ASSERT(JS_GetPropertyById(cx, obj, id, exportVal));
  return true;
}

[[nodiscard]] static bool GenerateDummyLoweredFunc(
    JSContext* cx, SharedTypeDef funcTypeDef, MutableHandleValue funcObject) {
  // Compile a new module containing just the single function
  SharedCompileArgs compileArgs = CompileArgs::buildAndReport(
      cx, ScriptedCaller::selfHosted(cx), FeatureOptions());
  if (!compileArgs) {
    return false;
  }

  MutableModuleMetadata moduleMeta = js_new<ModuleMetadata>();
  if (!moduleMeta || !moduleMeta->init(*compileArgs)) {
    ReportOutOfMemory(cx);
    return false;
  }
  MutableCodeMetadata codeMeta = moduleMeta->codeMeta;

  CompilerEnvironment compilerEnv(
      CompileMode::Once,
      BaselineAvailable(cx) ? Tier::Baseline : Tier::Optimized,
      DebugEnabled::False);
  compilerEnv.computeParameters();

  MOZ_RELEASE_ASSERT(funcTypeDef->recGroup().numTypes() == 1);
  if (!codeMeta->types->addRecGroup(&funcTypeDef->recGroup())) {
    ReportOutOfMemory(cx);
    return false;
  }
  if (!moduleMeta->addDefinedFuncWithType(
          /*funcTypeIndex=*/0,
          /*declareForRef=*/true,
          /*optionalExportedName=*/mozilla::Some(CacheableName()))) {
    ReportOutOfMemory(cx);
    return false;
  }

  if (!moduleMeta->prepareForCompile(compilerEnv.mode())) {
    ReportOutOfMemory(cx);
    return false;
  }

  ModuleGenerator mg(*codeMeta, compilerEnv, compilerEnv.initialState(),
                     nullptr, nullptr, nullptr);
  if (!mg.initializeCompleteTier()) {
    ReportOutOfMemory(cx);
    return false;
  }

  Bytes bytecode;
  Encoder encoder(bytecode, *codeMeta->types);
  if (!encoder.writeVarU32(0)) {  // locals
    return false;
  }
  if (!encoder.writeOp(Op::Unreachable) || !encoder.writeOp(Op::End)) {
    ReportOutOfMemory(cx);
    return false;
  }
  if (!mg.compileFuncDef(/*funcIndex=*/0, CallSite::FIRST_VALID_BYTECODE_OFFSET,
                         bytecode.begin(),
                         bytecode.begin() + bytecode.length())) {
    ReportOutOfMemory(cx);
    return false;
  }

  if (!mg.finishFuncDefs()) {
    ReportOutOfMemory(cx);
    return false;
  }

  SharedModule m = mg.finishModule(BytecodeBufferOrSource(), *moduleMeta,
                                   /*maybeCompleteTier2Listener=*/nullptr);
  if (!m) {
    ReportOutOfMemory(cx);
    return false;
  }

  // Instantiate the module and extract the function
  Rooted<WasmInstanceObject*> instanceObj(cx);
  Rooted<ImportValues> imports(cx);
  if (!m->instantiate(cx, imports.get(), nullptr, &instanceObj)) {
    return false;
  }
  RootedFunction exportedFunc(cx);
  if (!instanceObj->instance().getExportedFunction(cx, /*funcIndex=*/0,
                                                   &exportedFunc)) {
    return false;
  }
  funcObject.setObject(*exportedFunc);

  return true;
}

bool ComponentInstance::getCoreItemJSValue(JSContext* cx,
                                           ComponentSortIndex sortIndex,
                                           MutableHandleValue val) const {
  ComponentItem item = component_->resolveSortIndex(sortIndex);
  switch (item.kind()) {
    case ComponentItem::ItemKind::Defined: {
      // The only core things that can be defined directly in a component,
      // rather than aliased from a core module, are core functions.
      MOZ_RELEASE_ASSERT(item.sort() == ComponentSort::CoreFunction);

      // TODO(wasm-cm): Right now we always synthesize a function with the
      // correct signature that just traps. This will be fleshed out in the
      // future.
      return GenerateDummyLoweredFunc(
          cx, &component_->getTypeForCoreFunc(sortIndex.index), val);
    }
    case ComponentItem::ItemKind::Alias: {
      MOZ_RELEASE_ASSERT(item.aliasKind() == ComponentAliasKind::CoreExport);
      RootedObject exportsObj(cx,
                              coreInstanceExports_[item.aliasInstanceIndex()]);
      return GetValidatedNamedPropertyFromObject(
          cx, exportsObj, component_->coreExportAliasName(item), val);
    }
    default:
      MOZ_CRASH();
  }
}

bool ComponentInstance::instantiateCoreModule(
    JSContext* cx, const CoreInstanceDescFromModule& desc,
    MutableHandleObject exportsObj) const {
  RootedObject importObj(cx, NewPlainObjectWithProto(cx, nullptr));
  if (!importObj) {
    return false;
  }
  for (auto iter = desc.args.iter(); !iter.done(); iter.next()) {
    JSAtom* atom = iter.get().key().toAtom(cx);
    if (!atom) {
      return false;
    }
    RootedId id(cx, AtomToId(atom));
    RootedValue arg(cx, ObjectValue(*coreInstanceExports_[iter.get().value()]));
    if (!JS_DefinePropertyById(cx, importObj, id, arg, JSPROP_ENUMERATE)) {
      return false;
    }
  }

  SharedModule mod = component_->getCoreModule(desc.moduleIndex);
  Rooted<ImportValues> imports(cx);
  if (!GetImports(cx, *mod, importObj, imports.address())) {
    return false;
  }

  RootedObject instanceProto(
      cx, GlobalObject::getOrCreatePrototype(cx, JSProto_WasmInstance));
  if (!instanceProto) {
    return false;
  }
  Rooted<WasmInstanceObject*> instanceObj(cx);
  if (!mod->instantiate(cx, imports.get(), instanceProto, &instanceObj)) {
    return false;
  }
  exportsObj.set(&instanceObj->exportsObj());
  return true;
}

bool ComponentInstance::instantiateInlineExports(
    JSContext* cx, const ComponentInlineExports& inlineExports,
    MutableHandleObject exportsObj) const {
  // Matches the shape of a core instance's exports object.
  exportsObj.set(NewPlainObjectWithProto(cx, nullptr));
  if (!exportsObj) {
    return false;
  }
  for (auto iter = inlineExports.exports().iter(); !iter.done(); iter.next()) {
    JSAtom* atom = iter.get().key().toAtom(cx);
    if (!atom) {
      return false;
    }
    RootedId id(cx, AtomToId(atom));
    RootedValue val(cx);
    if (!getCoreItemJSValue(cx, iter.get().value(), &val) ||
        !JS_DefinePropertyById(
            cx, exportsObj, id, val,
            JSPROP_ENUMERATE | JSPROP_READONLY | JSPROP_PERMANENT)) {
      return false;
    }
  }
  return PreventExtensions(cx, exportsObj);
}

bool ComponentInstance::init(JSContext* cx) {
  // We have to instantiate all core instances regardless of whether they are
  // even reachable by the component's exports, because they can have start
  // functions that can trap. (There are probably other reasons too.) This means
  // that we don't really need to do anything clever; we can just iterate over
  // all the core instances defined by the component, and instantiate them in
  // order, with a guarantee from validation that all imports will be satisfied.
  for (uint32_t i = 0; i < component_->coreInstances().length(); i++) {
    RootedObject exportsObj(cx);
    bool ok = component_->getCoreInstance(i).desc().match(
        [&](const CoreInstanceDescFromModule& desc) {
          return instantiateCoreModule(cx, desc, &exportsObj);
        },
        [&](const ComponentInlineExports& inlineExports) {
          return instantiateInlineExports(cx, inlineExports, &exportsObj);
        });
    if (!ok) {
      return false;
    }
    if (!coreInstanceExports_.append(exportsObj)) {
      ReportOutOfMemory(cx);
      return false;
    }
  }

  return true;
}

static const char* ComponentSortKeyword(ComponentSort sort) {
  switch (sort) {
    case ComponentSort::Func:
      return "func";
    case ComponentSort::Type:
      return "type";
    case ComponentSort::Component:
      return "component";
    case ComponentSort::Instance:
      return "instance";
    case ComponentSort::CoreFunction:
      return "core func";
    case ComponentSort::CoreTable:
      return "core table";
    case ComponentSort::CoreMemory:
      return "core memory";
    case ComponentSort::CoreGlobal:
      return "core global";
    case ComponentSort::CoreTag:
      return "core tag";
    case ComponentSort::CoreType:
      return "core type";
    case ComponentSort::CoreModule:
      return "core module";
    case ComponentSort::CoreInstance:
      return "core instance";
    case ComponentSort::Invalid:
      return "invalid";

    default:
      MOZ_CRASH();
  }
}

static const char* ComponentAliasKindKeyword(ComponentAliasKind kind) {
  switch (kind) {
    case ComponentAliasKind::CoreExport:
      return "core export";
    case ComponentAliasKind::Export:
      return "export";
    case ComponentAliasKind::Outer:
      return "outer";

    default:
      MOZ_CRASH();
  }
}

UniqueChars wasm::ToString(ComponentItem item) {
  const char* sort = ComponentSortKeyword(item.sort());
  switch (item.kind()) {
    case ComponentItem::ItemKind::Invalid:
      return JS_smprintf("(invalid)");
    case ComponentItem::ItemKind::Defined:
      return JS_smprintf("(%s (defined %u))", sort, item.itemIndex());
    case ComponentItem::ItemKind::Import:
      return JS_smprintf("(%s (import %u))", sort, item.itemIndex());
    case ComponentItem::ItemKind::Export:
      return JS_smprintf("(%s (export %u))", sort, item.itemIndex());
    case ComponentItem::ItemKind::Alias:
      return JS_smprintf("(alias %s %u (%s %u))",
                         ComponentAliasKindKeyword(item.aliasKind()),
                         item.aliasInstanceIndex(), sort, item.itemIndex());

    default:
      MOZ_CRASH();
  }
}

UniqueChars wasm::ToString(ComponentSortIndex sortIndex) {
  return JS_smprintf("(%s %u)", ComponentSortKeyword(sortIndex.sort),
                     sortIndex.index);
}

#endif  // ENABLE_WASM_COMPONENTS
