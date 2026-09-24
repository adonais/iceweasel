struct A {
  int x, y;
  bool operator==(const A &other) const { // expected-error {{could use a defaulted version}}
    return x == other.x && y == other.y;
  }
  bool operator==(int other) const { return x == other; }
};

struct B {
  int x;
  bool operator==(const B &other) const { // expected-error {{could use a defaulted version}}
    return x == other.x;
  }
};

struct C {
  int x;
  float y;
  bool z;
  bool operator==(const C &other) const { // expected-error {{could use a defaulted version}}
    return x == other.x && y == other.y && z == other.z;
  }
};

template <class T> struct D {
  T x;
  bool operator==(const D &other) const { // expected-error {{could use a defaulted version}}
    return x == other.x;
  }
};

template <class T> struct E {
  T x;
  template <class Tp>
  bool operator==(const E<Tp> &other) const { // no-expected-error
    return x == other.x;
  }
};

struct F {
  int x, y;
  bool operator==(const F &other) const = default;
  bool operator!=(const F &other) const { return !(*this == other); } // expected-error {{'not equal' operator is redundant with defaulted 'equal' operator}}
};
