namespace std {

template <class T = void> struct greater {};
template <class T = void> struct less {};

template <class T1, class T2> struct pair {};

template <class T> struct allocator {};

template <class Key, class T, class Compare = std::less<Key>,
          class Allocator = std::allocator<std::pair<const Key, T>>>
class map {};

} // namespace std

std::map<int, float, std::greater<int>> s;
