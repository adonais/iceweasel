#ifdef XP_WIN
#  include <windows.h>
#else
#  include <unistd.h>
#endif

int main() {
  // Block until killed. The bound keeps a stray process from outliving the test
  // harness if a kill is ever lost.
  for (int i = 0; i < 60; ++i) {
#ifdef XP_WIN
    Sleep(10000);
#else
    sleep(10);
#endif
  }
  return 0;
}
