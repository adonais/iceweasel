if (!this.enqueueMark) {
  quit(0);
}

grayRoot()
function a() {
  enqueueMark("yield")
  enqueueMark("drain")
  gcslice(100000)
}
for (b of [, , ])
  for (c of [, , , 'otherzone'])
    a();
