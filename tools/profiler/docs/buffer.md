# Buffers and Memory Management

In a post-Fission world, precise memory management across many threads and processes is
especially important. In order for the profiler to achieve this, it uses a chunked buffer
strategy.

The [ProfileBuffer] is the overall buffer class that controls the memory and storage
for the profile, it allows allocating objects into it. This can be used freely
by things like markers and samples to store data as entries, without needing to know
about the general strategy for how the memory is managed.

The [ProfileBuffer] is then backed by the [ProfileChunkedBuffer]. This specialized
buffer grows incrementally, by allocating additional [ProfileBufferChunk] objects.
More and more chunks will be allocated until a memory limit is reached, where they will
be released. After releasing, the chunk will either be recycled or freed.

The limiting of memory usage is coordinated by the [ProfilerParent] in the parent
process. The [ProfilerParent] and [ProfilerChild] exchange IPC messages with information
about how much memory is being used. When the maximum byte threshold is passed,
the ProfileChunkManager in the parent process removes the oldest chunk, and then the
[ProfilerParent] sends a [DestroyReleasedChunksAtOrBefore] message to all of child
processes so that the oldest chunks in the profile are released. This helps long profiles
to keep having data in a similar time frame.

## Profile Buffer Terminology

ProfilerParent

: The main profiler machinery is installed in the parent process. It uses IPC to
  communicate to the child processes. The PProfiler is the actor which is used
  to communicate across processes to coordinate things. See {searchfox}`ProfilerParent.h <tools/profiler/public/ProfilerParent.h>`. The
  ProfilerParent uses the DestroyReleasedChunksAtOrBefore message to control the
  overall chunk limit.

ProfilerChild

: ProfilerChild is installed in every child process, it will receive requests from
  DestroyReleasedChunksAtOrBefore.

Entry

: This is an individual entry in the {searchfox}`ProfileBuffer.h <tools/profiler/core/ProfileBuffer.h>`,. These entry sizes are not
  related to the chunks sizes. An individual entry can straddle two different chunks.
  An entry can contain various pieces of data, like markers, samples, and stacks.

Chunk

: An arbitrary sized chunk of memory, managed by the [ProfileChunkedBuffer], and
  IPC calls from the ProfilerParent.

Unreleased Chunk

: This chunk is currently being used to write entries into.

Released chunk

: This chunk is full of data. When memory limits happen, it can either be recycled
  or freed.

Recycled chunk

: This is a chunk that was previously written into, and full. When memory limits occur,
  rather than freeing the memory, it is reused as the next chunk.

[destroyreleasedchunksatorbefore]: https://searchfox.org/mozilla-central/search?q=DestroyReleasedChunksAtOrBefore&path=&case=true&regexp=false
[profilebuffer]: https://searchfox.org/mozilla-central/search?q=ProfileBuffer&path=&case=true&regexp=false
[profilebufferchunk]: https://searchfox.org/mozilla-central/search?q=ProfileBufferChunk&path=&case=true&regexp=false
[profilebufferchunkmanagerwithlocallimit]: https://searchfox.org/mozilla-central/search?q=ProfileBufferChunkManagerWithLocalLimit&case=true&path=
[profilechunkedbuffer]: https://searchfox.org/mozilla-central/search?q=ProfileChunkedBuffer&path=&case=true&regexp=false
[profilechunkmanager]: https://searchfox.org/mozilla-central/search?q=ProfileBufferChunkManager.h&path=&case=true&regexp=false
[profilerchild]: https://searchfox.org/mozilla-central/search?q=ProfilerChild&path=&case=true&regexp=false
[profilerchild.h]: https://searchfox.org/mozilla-central/source/tools/profiler/public/ProfilerChild.h
[profilerparent]: https://searchfox.org/mozilla-central/search?q=ProfilerParent&path=&case=true&regexp=false
