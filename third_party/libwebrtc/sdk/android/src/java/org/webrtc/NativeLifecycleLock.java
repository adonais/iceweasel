/*
 *  Copyright 2026 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree. An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */

package org.webrtc;

import androidx.annotation.Nullable;
import java.util.concurrent.locks.ReentrantReadWriteLock;

/**
 * Thread-safe lifecycle lock for WebRTC native object wrappers. Guards native pointer access with a
 * read-lock and destruction with a write-lock, preventing Use-After-Free race conditions between
 * JNI method calls and dispose().
 */
class NativeLifecycleLock {
  public interface NativeCallable<T> {
    T call();
  }

  public interface NativePointerCallable<T> {
    T call(long nativePointer);
  }

  public interface NativeRunnable {
    void run();
  }

  public interface NativePointerRunnable {
    void run(long nativePointer);
  }

  public interface NativeDisposer {
    void dispose(long nativePointer);
  }

  private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();
  private final String className;
  private long nativePointer;

  NativeLifecycleLock(String className, long nativePointer) {
    this.className = className;
    this.nativePointer = nativePointer;
  }

  <T> T call(NativeCallable<T> callable) {
    lock.readLock().lock();
    try {
      checkNotDisposed();
      return callable.call();
    } finally {
      lock.readLock().unlock();
    }
  }

  <T> T call(NativePointerCallable<T> callable) {
    lock.readLock().lock();
    try {
      checkNotDisposed();
      return callable.call(nativePointer);
    } finally {
      lock.readLock().unlock();
    }
  }

  @Nullable
  <T> T callOrDefault(NativeCallable<T> callable, @Nullable T defaultValue) {
    lock.readLock().lock();
    try {
      if (nativePointer == 0) {
        Logging.w(className, className + " has been disposed.");
        return defaultValue;
      }
      return callable.call();
    } finally {
      lock.readLock().unlock();
    }
  }

  @Nullable
  <T> T callOrDefault(NativePointerCallable<T> callable, @Nullable T defaultValue) {
    lock.readLock().lock();
    try {
      if (nativePointer == 0) {
        Logging.w(className, className + " has been disposed.");
        return defaultValue;
      }
      return callable.call(nativePointer);
    } finally {
      lock.readLock().unlock();
    }
  }

  void run(NativeRunnable runnable) {
    lock.readLock().lock();
    try {
      checkNotDisposed();
      runnable.run();
    } finally {
      lock.readLock().unlock();
    }
  }

  void run(NativePointerRunnable runnable) {
    lock.readLock().lock();
    try {
      checkNotDisposed();
      runnable.run(nativePointer);
    } finally {
      lock.readLock().unlock();
    }
  }

  boolean runIfAlive(NativeRunnable runnable) {
    lock.readLock().lock();
    try {
      if (nativePointer == 0) {
        Logging.w(className, className + " has been disposed.");
        return false;
      }
      runnable.run();
      return true;
    } finally {
      lock.readLock().unlock();
    }
  }

  boolean runIfAlive(NativePointerRunnable runnable) {
    lock.readLock().lock();
    try {
      if (nativePointer == 0) {
        Logging.w(className, className + " has been disposed.");
        return false;
      }
      runnable.run(nativePointer);
      return true;
    } finally {
      lock.readLock().unlock();
    }
  }

  boolean isDisposed() {
    lock.readLock().lock();
    try {
      return nativePointer == 0;
    } finally {
      lock.readLock().unlock();
    }
  }

  void dispose(NativeDisposer disposer) {
    if (isDisposed()) {
      return;
    }
    lock.writeLock().lock();
    try {
      if (nativePointer != 0) {
        disposer.dispose(nativePointer);
        nativePointer = 0;
      }
    } finally {
      lock.writeLock().unlock();
    }
  }

  long getNativePointer() {
    lock.readLock().lock();
    try {
      checkNotDisposed();
      return nativePointer;
    } finally {
      lock.readLock().unlock();
    }
  }

  private void checkNotDisposed() {
    if (nativePointer == 0) {
      throw new IllegalStateException(className + " has been disposed.");
    }
  }
}
