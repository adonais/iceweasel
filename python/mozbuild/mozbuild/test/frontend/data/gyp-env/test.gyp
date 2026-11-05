{
  'targets': [
    {
      'target_name': 'test',
      'type': 'static_library',
      'defines': [
        'TEST_CC=<!(echo "$CC")',
        'TEST_CFLAGS=<!(echo "$CFLAGS")',
      ],
    },
  ],
}
