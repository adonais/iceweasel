/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

package org.mozilla.gecko.media;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.AdditionalMatchers.aryEq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.robolectric.Shadows.shadowOf;

import android.media.MediaCrypto;
import android.media.MediaDrm;
import android.media.NotProvisionedException;
import java.net.HttpURLConnection;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import mockwebserver3.Dispatcher;
import mockwebserver3.MockResponse;
import mockwebserver3.MockWebServer;
import mockwebserver3.RecordedRequest;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import org.robolectric.util.ReflectionHelpers;

@RunWith(RobolectricTestRunner.class)
@Config(shadows = GeckoMediaDrmBridgeTest.ShadowMediaCrypto.class)
public class GeckoMediaDrmBridgeTest {
  @Implements(MediaCrypto.class)
  public static class ShadowMediaCrypto {
    @Implementation
    protected static boolean isCryptoSchemeSupported(final UUID uuid) {
      return true;
    }
  }

  private static final String PROVISION_REQUEST = "provision-request";
  private static final String PROVISION_RESPONSE = "provision-response";

  private MockWebServer mServer;
  private MediaDrm mDrm;
  private GeckoMediaDrm.Callbacks mCallbacks;
  private GeckoMediaDrmBridge mBridge;
  private volatile int mResponseCode;
  private final CountDownLatch mSendResponse = new CountDownLatch(1);

  @Before
  public void setUp() throws Exception {
    mServer = new MockWebServer();
    mServer.setDispatcher(
        new Dispatcher() {
          @Override
          public MockResponse dispatch(final RecordedRequest request) throws InterruptedException {
            mSendResponse.await();
            return new MockResponse.Builder().code(mResponseCode).body(PROVISION_RESPONSE).build();
          }
        });
    mServer.start();

    final MediaDrm.ProvisionRequest request =
        ReflectionHelpers.callConstructor(MediaDrm.ProvisionRequest.class);
    ReflectionHelpers.setField(
        request, "mDefaultUrl", mServer.url("/provision?type=widevine").toString());
    ReflectionHelpers.setField(request, "mData", PROVISION_REQUEST.getBytes(UTF_8));

    final MediaDrm.KeyRequest keyRequest =
        ReflectionHelpers.callConstructor(MediaDrm.KeyRequest.class);
    ReflectionHelpers.setField(keyRequest, "mData", new byte[] {7, 8, 9});

    mDrm = mock(MediaDrm.class);
    when(mDrm.getProvisionRequest()).thenReturn(request);
    when(mDrm.openSession())
        .thenThrow(new NotProvisionedException("not provisioned"))
        .thenReturn(new byte[] {4, 5, 6}, new byte[] {1, 2, 3});
    when(mDrm.getKeyRequest(any(), any(), any(), anyInt(), any())).thenReturn(keyRequest);
    mCallbacks = mock(GeckoMediaDrm.Callbacks.class);
  }

  @After
  public void tearDown() throws Exception {
    try {
      if (mBridge != null) {
        final FutureTask<Void> release = new FutureTask<>(mBridge::release, null);
        new Thread(release).start();
        release.get(10, TimeUnit.SECONDS);
      }
    } finally {
      mSendResponse.countDown();
      mServer.close();
    }
  }

  private void createBridge(final int responseCode) throws Exception {
    mResponseCode = responseCode;
    final MediaDrm drm = mDrm;
    mBridge =
        new GeckoMediaDrmBridge("com.widevine.alpha") {
          @Override
          MediaDrm createMediaDrm(final UUID schemeUUID) {
            return drm;
          }
        };
    mBridge.setCallbacks(mCallbacks);
  }

  private void respondAndIdle() {
    mSendResponse.countDown();
    shadowOf(mBridge.getPendingOpsLooper()).idle();
  }

  @Test
  public void provisioningResponseIsProvidedAndPendingSessionIsResumed() throws Exception {
    createBridge(HttpURLConnection.HTTP_OK);
    mBridge.createSession(1, 2, "cenc", new byte[] {0});

    respondAndIdle();

    final RecordedRequest request = mServer.takeRequest(10, TimeUnit.SECONDS);
    assertNotNull("The provisioning request was never sent", request);
    assertEquals("POST", request.getMethod());
    assertEquals(PROVISION_REQUEST, request.getUrl().queryParameter("signedRequest"));
    assertEquals("Widevine CDM v1.0", request.getHeaders().get("User-Agent"));
    verify(mDrm).provideProvisionResponse(PROVISION_RESPONSE.getBytes(UTF_8));
    verify(mCallbacks).onSessionCreated(eq(1), eq(2), any(), any());
    verify(mCallbacks)
        .onSessionMessage(
            aryEq(new byte[] {1, 2, 3}), eq(GeckoMediaDrmBridge.LICENSE_REQUEST_INITIAL), any());

    mBridge.updateSession(3, new String(new byte[] {1, 2, 3}, UTF_8), new byte[] {0});
    verify(mCallbacks).onSessionUpdated(eq(3), any());
    verify(mCallbacks, never()).onRejectPromise(anyInt(), anyString());
  }

  @Test
  public void releaseWhileProvisioningDropsTheResponse() throws Exception {
    createBridge(HttpURLConnection.HTTP_OK);
    mBridge.createSession(1, 2, "cenc", new byte[] {0});
    assertNotNull(
        "The provisioning request was never sent", mServer.takeRequest(10, TimeUnit.SECONDS));
    final Thread provisioning = mBridge.getPendingOpsLooper().getThread();
    final AtomicReference<Throwable> uncaught = new AtomicReference<>();
    provisioning.setUncaughtExceptionHandler((thread, e) -> uncaught.set(e));

    mBridge.release();
    mSendResponse.countDown();
    provisioning.join(10_000);

    assertFalse("The provisioning thread outlived release()", provisioning.isAlive());
    assertNull("The dropped response threw on the provisioning thread", uncaught.get());
    verify(mCallbacks).onRejectPromise(eq(GeckoMediaDrmBridge.MAX_PROMISE_ID), anyString());
    verify(mCallbacks).onRejectPromise(eq(2), anyString());
    verify(mDrm, never()).provideProvisionResponse(any());
  }

  @Test
  public void serverErrorRejectsProvisioning() throws Exception {
    createBridge(HttpURLConnection.HTTP_INTERNAL_ERROR);
    mBridge.createSession(1, 2, "cenc", new byte[] {0});

    respondAndIdle();

    verify(mCallbacks).onRejectPromise(eq(GeckoMediaDrmBridge.MAX_PROMISE_ID), anyString());
    verify(mCallbacks).onRejectPromise(eq(2), anyString());
    verify(mDrm, never()).provideProvisionResponse(any());
  }

  @Test
  public void failedProvisioningForASessionRejectsItOnce() throws Exception {
    doReturn(new byte[] {4, 5, 6})
        .doThrow(new NotProvisionedException("not provisioned"))
        .when(mDrm)
        .openSession();
    createBridge(HttpURLConnection.HTTP_INTERNAL_ERROR);
    mBridge.createSession(1, 2, "cenc", new byte[] {0});

    respondAndIdle();

    verify(mCallbacks).onRejectPromise(eq(2), anyString());
  }

  @Test
  public void reprovisioningWhileResumingCreatesTheSession() throws Exception {
    doThrow(new NotProvisionedException("not provisioned"))
        .doThrow(new NotProvisionedException("still not provisioned"))
        .doReturn(new byte[] {4, 5, 6}, new byte[] {1, 2, 3})
        .when(mDrm)
        .openSession();
    createBridge(HttpURLConnection.HTTP_OK);
    mBridge.createSession(1, 2, "cenc", new byte[] {0});

    mSendResponse.countDown();

    verify(mCallbacks, timeout(10_000)).onSessionCreated(eq(1), eq(2), any(), any());
    verify(mDrm, times(2)).provideProvisionResponse(PROVISION_RESPONSE.getBytes(UTF_8));
    verify(mCallbacks, never()).onRejectPromise(anyInt(), anyString());
  }

  @Test
  public void releaseWaitsForTheProvisioningResponseToBeDelivered() throws Exception {
    createBridge(HttpURLConnection.HTTP_OK);
    final Thread release = new Thread(mBridge::release);
    final AtomicBoolean releaseWaited = new AtomicBoolean();
    doAnswer(
            invocation -> {
              release.start();
              release.join(500);
              releaseWaited.set(release.isAlive());
              return null;
            })
        .when(mDrm)
        .provideProvisionResponse(any());
    final Thread provisioning = mBridge.getPendingOpsLooper().getThread();

    mSendResponse.countDown();
    provisioning.join(10_000);

    assertTrue("release() ran during the provisioning response", releaseWaited.get());
    assertFalse("The provisioning thread outlived release()", provisioning.isAlive());
  }

  @Test
  public void keyStatusChangesAfterReleaseAreDropped() throws Exception {
    createBridge(HttpURLConnection.HTTP_OK);
    final ArgumentCaptor<MediaDrm.OnKeyStatusChangeListener> listener =
        ArgumentCaptor.forClass(MediaDrm.OnKeyStatusChangeListener.class);
    verify(mDrm).setOnKeyStatusChangeListener(listener.capture(), any());
    final List<MediaDrm.KeyStatus> keys =
        Collections.singletonList(
            ReflectionHelpers.callConstructor(
                MediaDrm.KeyStatus.class,
                ReflectionHelpers.ClassParameter.from(byte[].class, new byte[] {1}),
                ReflectionHelpers.ClassParameter.from(
                    int.class, MediaDrm.KeyStatus.STATUS_USABLE)));

    listener.getValue().onKeyStatusChange(mDrm, new byte[] {1, 2, 3}, keys, true);
    mBridge.release();
    listener.getValue().onKeyStatusChange(mDrm, new byte[] {1, 2, 3}, keys, true);

    verify(mCallbacks).onSessionBatchedKeyChanged(any(), any());
  }
}
