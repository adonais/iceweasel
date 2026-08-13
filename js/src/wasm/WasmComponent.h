/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

#ifndef wasm_component_h
#define wasm_component_h

#ifdef ENABLE_WASM_COMPONENTS

#  include "mozilla/HashTable.h"
#  include "mozilla/Maybe.h"
#  include "mozilla/RefPtr.h"
#  include "mozilla/Span.h"
#  include "mozilla/Variant.h"
#  include "mozilla/Vector.h"

#  include "js/WasmComponent.h"
#  include "wasm/WasmModule.h"

namespace js {
namespace wasm {

// A helper macro allowing component names to be printed with `%.*s`. Component
// names are always ASCII, so this is safe.
#  define ComponentName_Printf(n) \
    (int)(n).utf8Bytes().Length(), (n).utf8Bytes().data()

// A "sort", or "kind", of item in the component model, used for all cases where
// we must refer to a different item.
//
// This type is also used for the `externdesc` type, which describes what
// components (not core modules) can import and export, and whose cases are a
// subset of `sort`. Sorts that are valid for `externdesc` have the highest bit
// set. Additionally, sorts that can be exported by core modules (core:sort)
// have the second-highest bit set, and correspond to wasm::DefinitionKind.
enum class ComponentSort : uint8_t {
  Invalid = 0,

  Func = 0x80 | 0x01,
  Type = 0x80 | 0x03,
  Component = 0x80 | 0x04,
  Instance = 0x80 | 0x05,

  CoreFunction = 0x40 | int(DefinitionKind::Function),
  CoreTable = 0x40 | int(DefinitionKind::Table),
  CoreMemory = 0x40 | int(DefinitionKind::Memory),
  CoreGlobal = 0x40 | int(DefinitionKind::Global),
  CoreTag = 0x40 | int(DefinitionKind::Tag),

  CoreType = 0x10,
  CoreModule = 0x80 | 0x11,
  CoreInstance = 0x12,
};

// Checks if the given sort is valid for a component import or export (the
// component `externdesc` type).
inline bool ComponentSortValidForExternDesc(ComponentSort sort) {
  return (uint8_t(sort) & 0x80) != 0;
}

// Checks if the given sort is for a core item that can be imported or exported,
// i.e. a DefinitionKind imported into the component model. To extract the
// underlying DefinitionKind, use CoreSortFromComponentSort.
inline bool ComponentSortIsCoreSort(ComponentSort sort) {
  return (uint8_t(sort) & 0x40) != 0;
}

// Extracts the underlying DefinitionKind from a ComponentSort (if there is
// one).
inline DefinitionKind CoreSortFromComponentSort(ComponentSort sort) {
  MOZ_ASSERT(ComponentSortIsCoreSort(sort));
  return DefinitionKind(uint8_t(sort) & ~0xc0);
}

// Every kind of type that can be defined in the component model. Not all types
// are valid in all contexts.
enum class ComponentTypeKind : uint8_t {
  Invalid = 0,

  Bool = 0x7f,
  S8 = 0x7e,
  U8 = 0x7d,
  S16 = 0x7c,
  U16 = 0x7b,
  S32 = 0x7a,
  U32 = 0x79,
  S64 = 0x78,
  U64 = 0x77,
  F32 = 0x76,
  F64 = 0x75,
  Char = 0x74,
  String = 0x73,

  Record = 0x72,
  Variant = 0x71,
  List = 0x70,
  Tuple = 0x6f,
  Flags = 0x6e,
  Enum = 0x6d,
  Option = 0x6b,
  Result = 0x6a,
  Own = 0x69,
  Borrow = 0x68,

  Func = 0x40,  // async func types are not a separate kind
  Component = 0x41,
  Instance = 0x42,
  Resource = 0x3f,  // resource types with callbacks are not a separate kind

  // Type bounds
  Eq = 0x20,
  SubResource = 0x21,

  // Convenience for ComponentTypeKindIsPrimitive. "First" and "last" refer to
  // the actual byte value.
  FirstPrimitive = String,
  LastPrimitive = Bool,
};

// Checks if the given kind is for a primitive type (`primvaltype`), i.e. one
// that doesn't need to be defined and referenced.
inline bool ComponentTypeKindIsPrimitive(ComponentTypeKind kind) {
  return ComponentTypeKind::FirstPrimitive <= kind &&
         kind <= ComponentTypeKind::LastPrimitive;
}

// Checks if the given kind is for a value type (`valtype`), i.e. one that can
// be used for function parameters.
inline bool ComponentTypeKindIsValueType(ComponentTypeKind kind) {
  return ComponentTypeKindIsPrimitive(kind) ||
         (ComponentTypeKind::Borrow <= kind &&
          kind <= ComponentTypeKind::Record &&
          int(kind) != 0x6c  // the one weird gap in the binary
         );
}

// Forward declarations to satisfy the methods in ComponentType
class ComponentTypeDef;
class ComponentType;
struct ComponentRecordField;
struct ComponentVariantCase;
struct ComponentResultType;
struct ComponentFuncType;
class ComponentResourceType;
using ComponentTypeVector =
    mozilla::Vector<ComponentType, 0, SystemAllocPolicy>;
using ComponentRecordFieldVector =
    mozilla::Vector<ComponentRecordField, 0, SystemAllocPolicy>;
using ComponentVariantCaseVector =
    mozilla::Vector<ComponentVariantCase, 0, SystemAllocPolicy>;

// The type of an item within a component.
class ComponentType {
  // TODO(wasm-cm): See if we could do a fancy tagging scheme to store the kind
  // in the bits of the pointer. It's a bit funky because right now we use high
  // bits in the kind for various purposes and so we can't pack it down into 3
  // or 4 bits like you'd want.
  ComponentTypeKind kind_;

  RefPtr<ComponentTypeDef> typeDef_;

  explicit ComponentType(ComponentTypeKind kind)
      : kind_(kind), typeDef_(nullptr) {
    MOZ_ASSERT(ComponentTypeKindIsPrimitive(kind));
  }
  explicit ComponentType(ComponentTypeKind kind,
                         RefPtr<ComponentTypeDef> typeDef)
      : kind_(kind), typeDef_(std::move(typeDef)) {}

 public:
  ComponentType() : kind_(ComponentTypeKind::Invalid), typeDef_(nullptr) {}
  bool isValid() const { return kind_ != ComponentTypeKind::Invalid; }

  // "Constructors" for various kinds of types. The resulting types will NOT be
  // canonical until added to the process-wide ComponentCanonicalTypeSet.
  static ComponentType primitive(ComponentTypeKind kind) {
    MOZ_RELEASE_ASSERT(ComponentTypeKindIsPrimitive(kind));
    return ComponentType(kind);
  }
  static bool record(ComponentRecordFieldVector&& fields, ComponentType* type);
  static bool variant(ComponentVariantCaseVector&& cases, ComponentType* type);
  static bool list(ComponentType&& elemType, ComponentType* type);
  static bool tuple(ComponentTypeVector&& items, ComponentType* type);
  static bool flags(CacheableNameVector&& labels, ComponentType* type);
  static bool enum_(CacheableNameVector&& cases, ComponentType* type);
  static bool option(ComponentType&& inner, ComponentType* type);
  static bool result(ComponentResultType&& inner, ComponentType* type);
  static bool own(ComponentType&& inner, ComponentType* type);
  static bool borrow(ComponentType&& inner, ComponentType* type);
  static bool func(ComponentFuncType&& inner, ComponentType* type);
  static bool resource(ComponentResourceType&& inner, ComponentType* type);
  static bool subResource(ComponentType* type);

  ComponentTypeKind kind() const { return kind_; }
  RefPtr<ComponentTypeDef> typeDef() const { return typeDef_; }

  const ComponentRecordFieldVector& asRecord() const;
  const ComponentVariantCaseVector& asVariant() const;
  ComponentType asList() const;
  const ComponentTypeVector& asTuple() const;
  const CacheableNameVector& asFlags() const;
  const CacheableNameVector& asEnum() const;
  ComponentType asOption() const;
  ComponentResultType asResult() const;
  ComponentType asOwn() const;
  ComponentType asBorrow() const;
  const ComponentFuncType& asFunc() const;
  const ComponentResourceType& asResource() const;

  // Cheaply checks if two canonicalized component types are equal under the
  // rules of the component model. This is fully general and handles resource
  // types, but because it compares ComponentTypeDef pointers for equality, only
  // canonicalized types are supported.
  bool operator==(const ComponentType& other) const {
    return kind_ == other.kind_ && typeDef_ == other.typeDef_;
  }
  static bool maybeEquals(mozilla::Maybe<ComponentType> a,
                          mozilla::Maybe<ComponentType> b) {
    if (a.isNothing() && b.isNothing()) {
      return true;
    }
    if (a.isSome() != b.isSome()) {
      return false;
    }
    return *a == *b;
  }

  // Checks if two (non-canonical) component types are structurally equal. This
  // is different from the usual `==` operator, which assumes types have been
  // canonicalized. Resource types will always come back as unequal.
  //
  // In almost all cases, the `==` operator is what you want.
  static bool structurallyEqual(const ComponentType& a, const ComponentType& b);
};

static_assert(std::is_default_constructible_v<ComponentType>);
static_assert(std::is_copy_constructible_v<ComponentType>);

struct ComponentTypeHasher {
  using Key = ComponentType;
  using Lookup = ComponentType;

  static HashNumber hash(const Lookup& aLookup);
  static bool match(const Key& aKey, const Lookup& aLookup);
};

struct ComponentCanonicalTypeSet {
  mozilla::HashSet<ComponentType, ComponentTypeHasher, SystemAllocPolicy>
      canonicalTypes_;

  bool canonicalize(const ComponentType& type, ComponentType* canonicalized);
};

// Canonicalizes `type` against the process-wide canonical type set, returning
// the canonical representative through `*canonicalized`. Thread-safe.
[[nodiscard]] bool CanonicalizeComponentType(const ComponentType& type,
                                             ComponentType* canonicalized);

// Empties the process-wide canonical type set. Intended for shutdown / testing.
void PurgeComponentCanonicalTypes();

struct ComponentRecordField {
  CacheableName name;
  ComponentType type;

  ComponentRecordField(CacheableName&& name_, ComponentType type_)
      : name(std::move(name_)), type(type_) {}

  bool operator==(const ComponentRecordField& other) const {
    return name == other.name && type == other.type;
  }
};

struct ComponentVariantCase {
  CacheableName name;
  mozilla::Maybe<ComponentType> type;

  bool operator==(const ComponentVariantCase& other) const {
    return name == other.name && ComponentType::maybeEquals(type, other.type);
  }
};

struct ComponentResultType {
  mozilla::Maybe<ComponentType> type;
  mozilla::Maybe<ComponentType> errorType;

  static bool equals(const ComponentResultType& a,
                     const ComponentResultType& b) {
    return ComponentType::maybeEquals(a.type, b.type) &&
           ComponentType::maybeEquals(a.errorType, b.errorType);
  }
};

struct ComponentFuncType {
  ComponentTypeVector paramTypes;
  CacheableNameVector paramNames;
  mozilla::Maybe<ComponentType> resultType;

  bool operator==(const ComponentFuncType& other) const {
    MOZ_RELEASE_ASSERT(paramTypes.length() == paramNames.length());
    MOZ_RELEASE_ASSERT(other.paramTypes.length() == other.paramNames.length());
    if (paramTypes.length() != other.paramTypes.length()) {
      return false;
    }

    for (size_t i = 0; i < paramTypes.length(); i++) {
      if (paramTypes[i] != other.paramTypes[i] ||
          paramNames[i] != other.paramNames[i]) {
        return false;
      }
    }

    if (!ComponentType::maybeEquals(resultType, other.resultType)) {
      return false;
    }

    return true;
  }
};

class ComponentResourceType {
  // All resource types have (rep i32) for the time being.

  mozilla::Maybe<uint32_t> dtorIndex_;

 public:
  explicit ComponentResourceType(
      mozilla::Maybe<uint32_t> dtorIndex = mozilla::Nothing())
      : dtorIndex_(dtorIndex) {}

  mozilla::Maybe<uint32_t> dtorIndex() const { return dtorIndex_; }
};

using ComponentTypeSchema = mozilla::Variant<
    mozilla::Nothing, ComponentType, ComponentRecordFieldVector,
    ComponentVariantCaseVector, ComponentTypeVector, CacheableNameVector,
    ComponentResultType, ComponentFuncType, ComponentResourceType>;

class ComponentTypeDef : public AtomicRefCounted<ComponentTypeDef> {
  ComponentTypeSchema schema_;

 public:
  explicit ComponentTypeDef(ComponentTypeSchema&& schema)
      : schema_(std::move(schema)) {}

  const ComponentTypeSchema& schema() const { return schema_; }

  // Checks two typedefs for structural equality. Note that this is NOT the same
  // as comparing two types for equality, because a) not all types even have
  // ComponentTypeDefs, b) different type kinds may share the same kind of
  // backing storage (e.g. flags and enums), and c) because this method always
  // considers resource types to be unequal.
  static bool structurallyEqual(const ComponentTypeDef& a,
                                const ComponentTypeDef& b);
};

class Component;

enum class CanonMode : uint8_t {
  Lift,
  Lower,
};

[[nodiscard]] bool FlattenTypes(const ComponentTypeVector& types,
                                ValTypeVector* result, bool* hasStringsOrLists,
                                bool* tooDeep, uint32_t depth);
[[nodiscard]] bool FlattenType(const ComponentType& type, ValTypeVector* result,
                               bool* hasStringsOrLists, bool* tooDeep,
                               uint32_t depth);
[[nodiscard]] bool FlattenRecord(const ComponentRecordFieldVector& fields,
                                 ValTypeVector* result, bool* hasStringsOrLists,
                                 bool* tooDeep, uint32_t depth);
mozilla::Maybe<FuncType> FlattenFuncType(const ComponentFuncType& funcType,
                                         CanonMode mode, bool* memoryRequired,
                                         bool* reallocRequired, bool* tooDeep);

// A hash policy for StronglyUniqueNameSet that hashes items based on their
// trimmed, lowercased versions, but matches based on the full strongly-unique
// rules.
//
// The full strongly-unique rules are not hash-friendly; we have not yet figured
// out any way to "normalize" the name to a unique key that satisfies the
// strange carve-out rules for constructor and method names. But, we don't want
// to quadratically check each new name against every other name, so we take a
// disappointing halfway approach of hashing only the base part of the name, and
// then running the full strongly-unique logic in `match`. This results in more
// hash collisions and a less-inexpensive `match` method, but at least it keeps
// things from growing quadratically.
struct StronglyUniqueNameHasher {
  using Key = CacheableName;
  using Lookup = mozilla::Span<const char>;

  static HashNumber hash(const Lookup& aLookup);
  static bool match(const Key& aKey, const Lookup& aLookup);
};

// A class which can be used to check if a set of component model names is
// strongly-unique. The set owns its keys.
class StronglyUniqueNameSet {
  mozilla::HashSet<CacheableName, StronglyUniqueNameHasher, SystemAllocPolicy>
      data_;

 public:
  [[nodiscard]] bool add(mozilla::Span<const char> name, bool* duplicate);
};

// These values must match the binary encoding exactly.
enum class ComponentStringEncoding : uint8_t {
  UTF8 = 0x00,
  UTF16 = 0x01,
  Latin1PlusUTF16 = 0x02,
};

struct ComponentCanonOpts {
  ComponentStringEncoding stringEncoding;
  mozilla::Maybe<uint32_t> memoryIndex;
  mozilla::Maybe<uint32_t> reallocIndex;
  mozilla::Maybe<uint32_t> postReturnIndex;
};

class ComponentLiftedFuncDesc {
  uint32_t typeIndex_;
  ComponentCanonOpts canonOpts_;

 public:
  ComponentLiftedFuncDesc(uint32_t typeIndex, ComponentCanonOpts canonOpts)
      : typeIndex_(typeIndex), canonOpts_(canonOpts) {}

  // This returns the raw type index. To get the ComponentFuncType, call
  // Component::typeForFunc instead.
  uint32_t typeIndex() const { return typeIndex_; }
  const ComponentCanonOpts& canonOpts() const { return canonOpts_; }
};

// TODO(wasm-cm): Eventually this should probably be reworked to support all the
// async builtins too, but that is a future problem.
class ComponentResourceBuiltin {
 public:
  enum class Kind : uint8_t {
    ResourceNew = 0x02,  // aligns with binary encoding
    ResourceDrop = 0x03,
    ResourceRep = 0x04,
  };

 private:
  Kind kind_;
  ComponentType resourceType_;

 public:
  ComponentResourceBuiltin(Kind kind, ComponentType resourceType)
      : kind_(kind), resourceType_(resourceType) {
    MOZ_ASSERT(resourceType.kind() == ComponentTypeKind::Resource);
  }

  Kind kind() const { return kind_; }
  const ComponentType& resourceType() const { return resourceType_; }
};

// A class representing a component function (or other host function) lowered
// such that a core module can call it. This includes both (canon lower) and
// other things like builtin definitions (e.g. (canon resource.new)).
class ComponentCoreFuncDesc {
  using Payload = mozilla::Variant<uint32_t, ComponentResourceBuiltin>;

 private:
  SharedTypeDef coreFuncType_;
  Payload payload_;

  ComponentCoreFuncDesc(uint32_t funcIndex, SharedTypeDef&& flattenedType)
      : coreFuncType_(std::move(flattenedType)), payload_(funcIndex) {}
  ComponentCoreFuncDesc(ComponentResourceBuiltin&& builtinDesc,
                        SharedTypeDef&& coreFuncType)
      : coreFuncType_(std::move(coreFuncType)), payload_(builtinDesc) {}

 public:
  static ComponentCoreFuncDesc lowered(uint32_t funcIndex,
                                       SharedTypeDef&& flattenedType) {
    return ComponentCoreFuncDesc(funcIndex, std::move(flattenedType));
  }
  static ComponentCoreFuncDesc builtin(ComponentResourceBuiltin&& builtinDesc,
                                       SharedTypeDef&& coreFuncType) {
    return ComponentCoreFuncDesc(std::move(builtinDesc),
                                 std::move(coreFuncType));
  }

  const Payload& payload() const { return payload_; }
  const SharedTypeDef& coreFuncType() const { return coreFuncType_; }
};

// A sort/index pair referring to an item within a component or core module,
// corresponding to `sortidx` or `core:sortidx` in the component model spec.
struct ComponentSortIndex {
  ComponentSort sort = ComponentSort::Invalid;
  uint32_t index = 0;

  ComponentSortIndex() = default;
  ComponentSortIndex(ComponentSort sort, uint32_t index)
      : sort(sort), index(index) {}

  bool operator==(const ComponentSortIndex& other) const {
    return sort == other.sort && index == other.index;
  }
};

struct ComponentSortIndexHasher {
  using Lookup = ComponentSortIndex;
  static HashNumber hash(const Lookup& l) {
    return mozilla::HashGeneric(l.sort, l.index);
  }
  static bool match(const ComponentSortIndex& k, const Lookup& l) {
    return k == l;
  }
};

enum class ComponentAliasKind : uint8_t {
  CoreExport,
  Export,
  Outer,
};

// A generalized reference to an item in the component model. A ComponentItem
// may reference an import, an export, an item defined in the component itself,
// or an alias to an item defined elsewhere. This is the main type used for each
// index space in the component model, as imports, exports, aliases, and defined
// items can be interleaved in any order.
//
// The data is stored into two fields, one of which identifies the index space
// for the item (possibly in another component), and the other of which is the
// index in that index space.
//
// This first field, whatAndWhere_, stores all the information necessary to find
// the index space for the item. It is a packed field laid out like so:
//
//     000 00000000 00 0000000000000000000
//     │   │        │  └ instance index (ItemKind::Alias only)
//     │   │        └ alias kind (type ComponentAliasKind, ItemKind::Alias only)
//     │   └ sort (type ComponentSort)
//     └ kind (type ItemKind)
//
// For all ItemKinds, we store the "sort" of the item (e.g. func, table, type,
// or core func). This is not strictly necessary for all kinds, but facilitates
// debugging and can catch bugs. It _is_ strictly necessary for ItemKind::Alias,
// which uses the `(core:)?sortidx` production from the component spec.
// Additionally, for ItemKind::Alias we store the ComponentAliasKind (core
// export alias, component export alias, or outer alias) and the instance index,
// which is the index of the core instance, component instance, or outer
// component to fetch an item from.
//
// The second field, itemIndex_, is simply a uint32_t item index like you'd find
// anywhere else.
class ComponentItem {
  uint32_t whatAndWhere_;
  uint32_t itemIndex_;

  friend struct ComponentItemHasher;

 public:
  static constexpr uint32_t ItemKindShift = 29;
  static constexpr uint32_t ItemKindMask = 0b111 << ItemKindShift;
  static constexpr uint32_t SortShift = 21;
  static constexpr uint32_t SortMask = 0b11111111 << SortShift;
  static constexpr uint32_t AliasKindShift = 19;
  static constexpr uint32_t AliasKindMask = 0b11 << AliasKindShift;
  static constexpr uint32_t AliasInstanceMask = (1 << AliasKindShift) - 1;

  enum class ItemKind : uint8_t {
    Invalid = 0,

    // For Defined, Import, and Export, the sort of the item is always clear
    // from context. For example, when looking up a function by index, you would
    // get an item from the component's `funcs_` vector; therefore, the only
    // things you need to know are whether it is defined, imported, or exported,
    // and what index it would be in each of those three relevant vectors.
    // However, we still redundantly store a sort on these items because we have
    // the space in `whatAndWhere_` and can use it to catch bugs.
    Defined,
    Import,
    Export,

    // Alias refers to the component concept of "alias"; that is, projecting an
    // item out of another component/core instance into the current instance's
    // index space. For this we require all fields of `whatAndWhere_`.
    Alias,
  };

  explicit ComponentItem(ItemKind kind, ComponentSort sort, uint32_t itemIndex)
      : whatAndWhere_(0), itemIndex_(itemIndex) {
    MOZ_ASSERT(kind != ItemKind::Alias);

    whatAndWhere_ |= uint32_t(kind) << ItemKindShift;
    whatAndWhere_ |= uint32_t(sort) << SortShift;

    MOZ_ASSERT(this->kind() == kind);
    MOZ_ASSERT(this->sort() == sort);
  }
  explicit ComponentItem(ComponentAliasKind aliasKind, ComponentSort sort,
                         uint32_t instanceIndex, uint32_t itemIndex)
      : whatAndWhere_(0), itemIndex_(itemIndex) {
    MOZ_ASSERT((instanceIndex & ~AliasInstanceMask) == 0);
    whatAndWhere_ |= uint32_t(ItemKind::Alias) << ItemKindShift;
    whatAndWhere_ |= uint32_t(sort) << SortShift;
    whatAndWhere_ |= uint32_t(aliasKind) << AliasKindShift;
    whatAndWhere_ |= instanceIndex;

    MOZ_ASSERT(this->kind() == ItemKind::Alias);
    MOZ_ASSERT(this->sort() == sort);
    MOZ_ASSERT(this->aliasKind() == aliasKind);
    MOZ_ASSERT(this->aliasInstanceIndex() == instanceIndex);
  }

 public:
  ComponentItem() : whatAndWhere_(0), itemIndex_(0) {
    MOZ_ASSERT(this->kind() == ItemKind::Invalid);
  }

  static ComponentItem defined(ComponentSort sort, uint32_t itemIndex) {
    return ComponentItem(ItemKind::Defined, sort, itemIndex);
  }
  static ComponentItem import(ComponentSort sort, uint32_t itemIndex) {
    return ComponentItem(ItemKind::Import, sort, itemIndex);
  }
  static ComponentItem export_(ComponentSort sort, uint32_t itemIndex) {
    return ComponentItem(ItemKind::Export, sort, itemIndex);
  }
  static ComponentItem alias(ComponentAliasKind aliasKind, ComponentSort sort,
                             uint32_t instanceIndex, uint32_t itemIndex) {
    return ComponentItem(aliasKind, sort, instanceIndex, itemIndex);
  }

  ItemKind kind() const {
    return ItemKind((whatAndWhere_ & ItemKindMask) >> ItemKindShift);
  }
  ComponentSort sort() const {
    return ComponentSort((whatAndWhere_ & SortMask) >> SortShift);
  }
  uint32_t itemIndex() const { return itemIndex_; }

  ComponentAliasKind aliasKind() const {
    MOZ_RELEASE_ASSERT(kind() == ItemKind::Alias);
    return ComponentAliasKind((whatAndWhere_ & AliasKindMask) >>
                              AliasKindShift);
  }
  uint32_t aliasInstanceIndex() const {
    MOZ_RELEASE_ASSERT(kind() == ItemKind::Alias);
    return whatAndWhere_ & AliasInstanceMask;
  }

  // Outer aliases are a fun special case that comes up often enough to deserve
  // a short helper.
  bool isOuterAlias() const {
    return kind() == ItemKind::Alias &&
           aliasKind() == ComponentAliasKind::Outer;
  }
  ComponentSortIndex outerAliasSortIndex() const {
    MOZ_RELEASE_ASSERT(isOuterAlias());
    return ComponentSortIndex(sort(), itemIndex());
  }

  bool operator==(const ComponentItem& other) const {
    return whatAndWhere_ == other.whatAndWhere_ &&
           itemIndex_ == other.itemIndex_;
  }
};

// TODO(wasm-cm): Add static asserts for MaxComponents and
// MaxComponentNestingDepth or whatever, eventually
static_assert(MaxComponentCoreInstances <= ComponentItem::AliasInstanceMask);

struct ComponentItemHasher {
  using Lookup = ComponentItem;
  static HashNumber hash(const Lookup& l) {
    return mozilla::HashGeneric(l.whatAndWhere_, l.itemIndex_);
  }
  static bool match(const ComponentItem& k, const Lookup& l) { return k == l; }
};

using CoreInstanceInstantiateArgs =
    mozilla::HashMap<CacheableName,  // import module name
                     uint32_t,       // instance index
                     CacheableNameHasher, SystemAllocPolicy>;

// Instructions for instantiating a core instance from a core module,
// corresponding to this text production:
//
//     (core instance (instantiate <modidx>) (with ...)*)`
//
struct CoreInstanceDescFromModule {
  // The core module to instantiate.
  uint32_t moduleIndex;

  // The instance's "with" declarations. In the binary format there is no inline
  // export form, only a form that uses the exports of another core instance.
  CoreInstanceInstantiateArgs args;
};

class ComponentInlineExports {
  using ExportMap = mozilla::HashMap<CacheableName, ComponentSortIndex,
                                     CacheableNameHasher, SystemAllocPolicy>;
  using OriginalIndexMap =
      mozilla::HashMap<ComponentSortIndex, uint32_t, ComponentSortIndexHasher,
                       SystemAllocPolicy>;

  // Maps from export names to ComponentSortIndexes in this "instance"'s index
  // space.
  ExportMap exports_;

  // Maps from exported items in this instance to the original indices of the
  // items being re-exported.
  OriginalIndexMap originalIndices_;

 public:
  struct Builder {
    uint32_t numFuncs = 0;
    uint32_t numTypes = 0;
    uint32_t numComponents = 0;
    uint32_t numInstances = 0;
    uint32_t numCoreFunctions = 0;
    uint32_t numCoreTables = 0;
    uint32_t numCoreMemories = 0;
    uint32_t numCoreGlobals = 0;
    uint32_t numCoreTags = 0;
    uint32_t numCoreTypes = 0;
    uint32_t numCoreModules = 0;
    uint32_t numCoreInstances = 0;

    uint32_t trackItemOfSort(ComponentSort sort);
  };

  bool addExport(Builder* builder, CacheableName&& name,
                 ComponentSortIndex exported);

  // Gets a sortidx representing the given exported item within this
  // inline-export instance (i.e. not the original sortidx of the item being
  // re-exported).
  mozilla::Maybe<ComponentSortIndex> getExport(const CacheableName& name) const;

  // Given an export that originated from this instance, resolves the sortidx of
  // the original item being re-exported. Crashes if the item does not exist.
  ComponentSortIndex resolveOriginal(ComponentSortIndex expFromThis) const;

  // Combines getExport + resolveOriginal to get the original sortidx within the
  // component, for a given export name.
  ComponentSortIndex mustResolveExportToOriginal(
      const CacheableName& name) const;
};

// Instructions for instantiating a core instance.
class CoreInstanceDesc {
  using CoreInstanceVariant =
      mozilla::Variant<CoreInstanceDescFromModule, ComponentInlineExports>;

  CoreInstanceVariant desc_;

  // The owning component for this instance.
  const Component* component_;

 public:
  explicit CoreInstanceDesc(const Component* c,
                            CoreInstanceDescFromModule&& fromModule)
      : desc_(std::move(fromModule)), component_(c) {}
  explicit CoreInstanceDesc(const Component* c,
                            ComponentInlineExports&& inlineExports)
      : desc_(std::move(inlineExports)), component_(c) {}

  const CoreInstanceVariant& desc() const { return desc_; }

  // Gets an export from a core instance by name.
  mozilla::Maybe<ComponentSortIndex> getExport(const CacheableName& name) const;

  const TypeDef& getCoreFuncType(uint32_t coreFuncIndex) const;
  const TableDesc& getTable(uint32_t tableIndex) const;
  const MemoryDesc& getMemory(uint32_t memoryIndex) const;
  const GlobalDesc& getGlobal(uint32_t globalIndex) const;
  const TagDesc& getTag(uint32_t tagIndex) const;
};

// Describes an import or export from a wasm component.
class ComponentExternDesc {
  ComponentSort sort_;
  ComponentType type_;

  // TODO(wasm-cm): This is a total hack, but since we currently don't have a
  // notion of core module types, we actually just store the index of the
  // relevant core module within the component. This obviously will not work as
  // soon as we do anything with multiple components.
  uint32_t coreModuleIndex_;

  explicit ComponentExternDesc(ComponentSort sort, ComponentType&& type)
      : sort_(sort), type_(std::move(type)) {
    MOZ_ASSERT(ComponentSortValidForExternDesc(sort));
  }
  explicit ComponentExternDesc(uint32_t coreModuleIndex)
      : sort_(ComponentSort::CoreModule), coreModuleIndex_(coreModuleIndex) {}

 public:
  ComponentExternDesc() = default;

  static ComponentExternDesc func(ComponentType&& funcType) {
    MOZ_ASSERT(funcType.kind() == ComponentTypeKind::Func);
    return ComponentExternDesc(ComponentSort::Func, std::move(funcType));
  }
  static ComponentExternDesc type(ComponentType&& type) {
    return ComponentExternDesc(ComponentSort::Type, std::move(type));
  }
  static ComponentExternDesc coreModule(uint32_t coreModuleIndex) {
    return ComponentExternDesc(coreModuleIndex);
  }

  bool isValid() const { return sort_ != ComponentSort::Invalid; }
  ComponentSort sort() const { return sort_; }
  ComponentType asFunc() const {
    MOZ_RELEASE_ASSERT(sort() == ComponentSort::Func);
    return type_;
  }
  ComponentType asType() const {
    MOZ_RELEASE_ASSERT(sort() == ComponentSort::Type);
    return type_;
  }
  uint32_t asCoreModule() const {
    MOZ_RELEASE_ASSERT(sort() == ComponentSort::CoreModule);
    // TODO(wasm-cm): This should obviously return a proper core module type,
    // when we actually support that.
    return coreModuleIndex_;
  }

  static bool matches(const ComponentExternDesc& sub,
                      const ComponentExternDesc& super);
};

static_assert(std::is_default_constructible_v<ComponentExternDesc>);

class ComponentImport {
  CacheableName name_;
  ComponentExternDesc externDesc_;

 public:
  explicit ComponentImport(CacheableName&& name,
                           const ComponentExternDesc& externDesc)
      : name_(std::move(name)), externDesc_(externDesc) {}

  const CacheableName& name() const { return name_; }
  const ComponentExternDesc& externDesc() const { return externDesc_; }
};

class ComponentExport {
  CacheableName name_;
  ComponentExternDesc externDesc_;

 public:
  explicit ComponentExport(CacheableName&& name, ComponentExternDesc externDesc)
      : name_(std::move(name)), externDesc_(externDesc) {}

  const CacheableName& name() const { return name_; }
  const ComponentExternDesc& externDesc() const { return externDesc_; }
};

// TODO(wasm-cm): This type is enormous, but a lot of the storage is due to
// containers like HashMap and Vector that aren't actually required once the
// component is built and validated. It would probably be smart to split this
// into ComponentBuilder and Component classes so that the final version can be
// smaller. (After all, we will have a lot of components in practice!)
class Component : public JS::WasmComponent {
 public:
  using CoreModuleVector = mozilla::Vector<SharedModule, 0, SystemAllocPolicy>;
  using CoreInstanceVector =
      mozilla::Vector<CoreInstanceDesc, 0, SystemAllocPolicy>;
  using TypeVector = mozilla::Vector<ComponentType, 0, SystemAllocPolicy>;
  using FuncVector =
      mozilla::Vector<ComponentLiftedFuncDesc, 0, SystemAllocPolicy>;
  using CoreFuncVector =
      mozilla::Vector<ComponentCoreFuncDesc, 0, SystemAllocPolicy>;
  using ImportVector = mozilla::Vector<ComponentImport, 0, SystemAllocPolicy>;
  using ExportVector = mozilla::Vector<ComponentExport, 0, SystemAllocPolicy>;
  using ItemVector = mozilla::Vector<ComponentItem, 0, SystemAllocPolicy>;
  using AliasNameMap =
      mozilla::HashMap<ComponentSortIndex, CacheableName,
                       ComponentSortIndexHasher, SystemAllocPolicy>;

 private:
  CoreModuleVector definedCoreModules_;
  CoreInstanceVector definedCoreInstances_;
  TypeVector definedTypes_;
  FuncVector definedFuncs_;
  CoreFuncVector definedCoreFuncs_;
  ImportVector imports_;
  ExportVector exports_;

  ItemVector funcs_;
  ItemVector types_;
  ItemVector components_;
  ItemVector instances_;
  ItemVector coreFuncs_;
  ItemVector coreTables_;
  ItemVector coreMemories_;
  ItemVector coreGlobals_;
  ItemVector coreTags_;
  ItemVector coreTypes_;
  ItemVector coreModules_;
  ItemVector coreInstances_;

  // TODO(wasm-cm): Right now, instantiation requires us to get JS object
  // wrappers for all values we pass as imports. This means that we need to look
  // everything up from the instance's exports object, which means we need to
  // know the names of all the exports. This really should not be necessary,
  // because within the component model we have the index of everything
  // statically, but we don't store the JS objects for tables, globals, etc.
  // anywhere but the exports object today, and refactoring this is way too
  // invasive for the current state of the project. So, the current hack is to
  // just store all the names for all aliases of exports, so when we find such
  // an item, we can look it up here instead of going to the thing by index.
  AliasNameMap aliasNames_;

  template <typename T>
  bool addDefinedItem(
      ComponentSort sort, T&& item,
      mozilla::Vector<T, 0, SystemAllocPolicy>& definedItemsVector,
      ItemVector& indexSpaceVector) {
    uint32_t index = definedItemsVector.length();
    if (!definedItemsVector.append(std::forward<T>(item))) {
      return false;
    }
    return indexSpaceVector.append(ComponentItem::defined(sort, index));
  }

 public:
  Component() = default;

  // --------------------------------------------------------------------------
  // Accessors and adders for each index space

  const ImportVector& imports() const { return imports_; }
  [[nodiscard]] bool addImport(ComponentImport&& import);

  const ExportVector& exports() const { return exports_; }
  [[nodiscard]] bool addExport(ComponentExport&& exp);

  const ItemVector& funcs() const { return funcs_; }
  [[nodiscard]] bool addFunc(ComponentLiftedFuncDesc&& func) {
    return addDefinedItem(ComponentSort::Func, std::move(func), definedFuncs_,
                          funcs_);
  }

  const ItemVector& types() const { return types_; }
  ComponentType getType(uint32_t typeIndex) const;
  [[nodiscard]] bool addType(ComponentType&& type) {
    MOZ_RELEASE_ASSERT(type.isValid());
    return addDefinedItem(ComponentSort::Type, std::move(type), definedTypes_,
                          types_);
  }

  // TODO(wasm-cm): Functions for components
  // TODO(wasm-cm): Functions for component instances

  const ItemVector& coreFuncs() const { return coreFuncs_; }
  [[nodiscard]] bool addAliasOfExportedCoreFunc(ComponentItem funcItem) {
    MOZ_RELEASE_ASSERT(funcItem.kind() == ComponentItem::ItemKind::Alias);
    MOZ_RELEASE_ASSERT(funcItem.sort() == ComponentSort::CoreFunction);
    return coreFuncs_.append(funcItem);
  }
  [[nodiscard]] bool addDefinedCoreFunc(ComponentCoreFuncDesc&& coreFunc) {
    uint32_t funcIndex = definedCoreFuncs_.length();
    if (!definedCoreFuncs_.append(std::move(coreFunc))) {
      return false;
    }
    return coreFuncs_.append(
        ComponentItem::defined(ComponentSort::CoreFunction, funcIndex));
  }

  const ItemVector& coreTables() const { return coreTables_; }
  const TableDesc& getCoreTable(uint32_t tableIndex) const;
  [[nodiscard]] bool addCoreTable(ComponentItem tableItem) {
    MOZ_RELEASE_ASSERT(tableItem.kind() == ComponentItem::ItemKind::Alias);
    MOZ_RELEASE_ASSERT(tableItem.sort() == ComponentSort::CoreTable);
    return coreTables_.append(tableItem);
  }

  const ItemVector& coreMemories() const { return coreMemories_; }
  const MemoryDesc& getCoreMemory(uint32_t memoryIndex) const;
  [[nodiscard]] bool addCoreMemory(ComponentItem memoryItem) {
    MOZ_RELEASE_ASSERT(memoryItem.kind() == ComponentItem::ItemKind::Alias);
    MOZ_RELEASE_ASSERT(memoryItem.sort() == ComponentSort::CoreMemory);
    return coreMemories_.append(memoryItem);
  }

  const ItemVector& coreGlobals() const { return coreGlobals_; }
  const GlobalDesc& getCoreGlobal(uint32_t globalIndex) const;
  [[nodiscard]] bool addCoreGlobal(ComponentItem globalItem) {
    MOZ_RELEASE_ASSERT(globalItem.kind() == ComponentItem::ItemKind::Alias);
    MOZ_RELEASE_ASSERT(globalItem.sort() == ComponentSort::CoreGlobal);
    return coreGlobals_.append(globalItem);
  }

  const ItemVector& coreTags() const { return coreTags_; }
  const TagDesc& getCoreTag(uint32_t tagIndex) const;
  bool addCoreTag(ComponentItem tagItem) {
    MOZ_RELEASE_ASSERT(tagItem.kind() == ComponentItem::ItemKind::Alias);
    MOZ_RELEASE_ASSERT(tagItem.sort() == ComponentSort::CoreTag);
    return coreTags_.append(tagItem);
  }

  const ItemVector& coreModules() const { return coreModules_; }
  SharedModule getCoreModule(uint32_t modIndex) const;
  [[nodiscard]] bool addCoreModule(SharedModule module) {
    return addDefinedItem(ComponentSort::CoreModule, std::move(module),
                          definedCoreModules_, coreModules_);
  }

  const ItemVector& coreInstances() const { return coreInstances_; }
  const CoreInstanceDesc& getCoreInstance(uint32_t instanceIndex) const;
  [[nodiscard]] bool addCoreInstance(CoreInstanceDesc&& instance) {
    return addDefinedItem(ComponentSort::CoreInstance, std::move(instance),
                          definedCoreInstances_, coreInstances_);
  }

  // Given a `sortidx` or `core:sortidx`, resolve the actual component item from
  // the appropriate index space.
  ComponentItem resolveSortIndex(ComponentSortIndex sortIndex) const;

  [[nodiscard]] bool saveExportNameForAlias(ComponentSortIndex sortIndexOfAlias,
                                            CacheableName&& name);
  const CacheableName& getExportNameForAlias(
      ComponentSortIndex sortIndexOfAlias) const;

  // --------------------------------------------------------------------------
  // Utilities for accessing type information

  // Gets the type of a component func (not a core func). It is always safe to
  // call `.asFunc()` on the result.
  ComponentType getTypeForFunc(uint32_t funcIndex) const;

  // Gets the type of a core func (not a component func).
  const TypeDef& getTypeForCoreFunc(uint32_t coreFuncIndex) const;

  size_t gcMallocBytesExcludingCode() const {
    // TODO(wasm-cm): Right now, this only sums up the sizes of the inner
    // modules, but this is not an accurate picture of a component's memory
    // footprint.
    size_t total = 0;
    for (const SharedModule& module : definedCoreModules_) {
      total += module->gcMallocBytesExcludingCode();
    }
    return total;
  }

  size_t tier1CodeMemoryUsed() const {
    // TODO(wasm-cm): As above, this only sums up the memory for core modules,
    // and does not account for other potential code memory.
    size_t total = 0;
    for (const SharedModule& module : definedCoreModules_) {
      total += module->tier1CodeMemoryUsed();
    }
    return total;
  }

  // --------------------------------------------------------------------------
  // Instantiation

  [[nodiscard]] bool instantiate(
      JSContext* cx, HandleObject instanceProto,
      MutableHandle<WasmComponentInstanceObject*> instance) const;

 private:
  // JS API and JS::WasmComponent implementation:
  JSObject* createObject(JSContext* cx) const override;
};

using MutableComponent = RefPtr<Component>;
using SharedComponent = RefPtr<const Component>;

class ComponentInstance {
  // The containing JS::Realm.
  JS::Realm* realm_;

  // The containing JSContext.
  JSContext* cx_;

  // The wasm::Component for this instance.
  const SharedComponent component_;

  using CoreInstanceVector =
      GCVector<WasmInstanceObject*, 0, SystemAllocPolicy>;
  // An array of all the core instances owned by this component instance. NOTE!
  // This array is sparse; its indices will always correspond 1:1 with
  // Component::coreInstances(), but not all such instances will get a
  // WasmInstanceObject.
  CoreInstanceVector coreInstances_;

  // Only WasmComponentInstanceObject can call the private trace function.
  friend class js::WasmComponentInstanceObject;
  void tracePrivate(JSTracer* trc);

 public:
  ComponentInstance(JSContext* cx, Handle<WasmComponentInstanceObject*> object,
                    const SharedComponent component);
  ~ComponentInstance();

  static ComponentInstance* create(JSContext* cx,
                                   Handle<WasmComponentInstanceObject*> object,
                                   const SharedComponent component);
  static void destroy(ComponentInstance* instance);

  [[nodiscard]] bool init(JSContext* cx);

  // Gets a core instance object for a given index in the component, if one
  // exists. (It may not; inline-export instances do not get actual objects.)
  // The result may therefore be null.
  WasmInstanceObject* coreInstance(uint32_t index) const {
    if (coreInstances_.length() <= index) {
      return nullptr;
    }
    return coreInstances_[index];
  }
};

UniqueChars ToString(ComponentItem item);
UniqueChars ToString(ComponentSortIndex sortIndex);

}  // namespace wasm
}  // namespace js

#endif  // ENABLE_WASM_COMPONENTS

#endif  // wasm_component_h
