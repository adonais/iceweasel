namespace std {
    template<typename T>
    struct remove_reference {
      using type = T;
    };
    template<typename T>
    struct remove_reference<T&> {
      using type = T;
    };
    template<typename T>
    using remove_reference_t = typename remove_reference<T>::type; // NOLINT
}

using type = typename std::remove_reference<int&>::type;
