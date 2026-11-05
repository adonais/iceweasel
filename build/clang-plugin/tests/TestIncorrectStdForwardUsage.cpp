namespace std {
template<class T>
T&& forward(T& a);
}

template<class T>
void perfect_forwarding(T&& arg)
{
  std::forward<T>(arg);
}

template<class T0, class T1>
void perfect_forwarding(T0,  T1&& arg1)
{
  std::forward<T1>(arg1);
}

template<class... Ts>
void perfect_forwarding_pack(Ts&&... args)
{
  auto _ [] = {std::forward<Ts>(args)...};
}

template<class T, class... Ts>
void perfect_forwarding_pack(T, Ts&&... args)
{
  auto _ [] = {std::forward<Ts>(args)...};
}

template<class T>
void imperfect_forwarding_ref(T& arg)
// expected-error@-1 {{Parameter 'arg' perfectly forwarded through 'std::forward' while not using universal references}}
{
  std::forward<T>(arg);
}

template<class T>
void imperfect_forwarding_constref(const T& arg)
// expected-error@-1 {{Parameter 'arg' perfectly forwarded through 'std::forward' while not using universal references}}
{
  std::forward<T>(arg);
}

template<class T>
void imperfect_forwarding_val(T arg)
// expected-error@-1 {{Parameter 'arg' perfectly forwarded through 'std::forward' while not using universal references}}
{
  std::forward<T>(arg);
}

template<class T>
void imperfect_forwarding_constval(const T arg)
// expected-error@-1 {{Parameter 'arg' perfectly forwarded through 'std::forward' while not using universal references}}
{
  std::forward<T>(arg);
}

#define IN_MACRO(funcname) template<class T> void funcname(const T arg)

IN_MACRO(ignored){std::forward<T>(arg);}

template<class T>
struct S
{
  void nested_template(T arg)
  {
    // Probably incorrect, but dependent on the instantiation of S, which is generally not inferred.
    std::forward<T>(arg);
  }
};
