/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package org.mozilla.samples.fxa

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.CheckBox
import android.widget.TextView
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.app.ActivityCompat
import androidx.core.net.toUri
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import mozilla.appservices.fxaclient.FxaServer
import mozilla.components.concept.sync.AccountObserver
import mozilla.components.concept.sync.AuthType
import mozilla.components.concept.sync.DeviceCapability
import mozilla.components.concept.sync.DeviceConfig
import mozilla.components.concept.sync.DeviceType
import mozilla.components.concept.sync.OAuthAccount
import mozilla.components.concept.sync.Profile
import mozilla.components.feature.qr.QrFeature
import mozilla.components.lib.fetch.httpurlconnection.HttpURLConnectionClient
import mozilla.components.service.fxa.FxaAuthData
import mozilla.components.service.fxa.ServerConfig
import mozilla.components.service.fxa.manager.FxaAccountManager
import mozilla.components.support.base.log.Log
import mozilla.components.support.base.log.sink.AndroidLogSink
import mozilla.components.support.ktx.android.view.setupPersistentInsets
import mozilla.components.support.rusthttp.RustHttpConfig
import mozilla.components.support.rustlog.RustLog
import kotlin.coroutines.CoroutineContext

open class MainActivity : AppCompatActivity(), LoginFragment.OnLoginCompleteListener, CoroutineScope {
    private var scopesWithoutKeys: Set<String> = setOf("profile")
    private var scopesWithKeys: Set<String> = setOf("profile", "https://identity.mozilla.com/apps/oldsync")
    private var scopes: Set<String> = scopesWithoutKeys

    private lateinit var qrFeature: QrFeature

    private lateinit var job: Job
    override val coroutineContext: CoroutineContext
        get() = Dispatchers.Main + job

    private val accountManager by lazy {
        FxaAccountManager(
            context = applicationContext,
            serverConfig = ServerConfig(FxaServer.Custom(CONFIG_URL), CLIENT_ID, REDIRECT_URL),
            deviceConfig = DeviceConfig(
                name = "A-C FxA Sample",
                type = DeviceType.MOBILE,
                capabilities = setOf(DeviceCapability.SEND_TAB),
            ),
            syncConfig = null,
            applicationScopes = scopesWithKeys,
        )
    }

    companion object {
        const val CLIENT_ID = "3c49430b43dfba77"
        const val CONFIG_URL = "https://accounts.firefox.com"
        const val REDIRECT_URL = "$CONFIG_URL/oauth/success/3c49430b43dfba77"
        private const val REQUEST_CODE_CAMERA_PERMISSIONS = 1
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        enableEdgeToEdge()
        window.setupPersistentInsets(true)

        RustLog.enable()
        RustHttpConfig.setClient(lazy { HttpURLConnectionClient() })

        Log.addSink(AndroidLogSink())

        job = Job()

        accountManager.register(accountObserver, owner = this, autoPause = true)
        launch { accountManager.start() }

        qrFeature = QrFeature(
            this,
            fragmentManager = supportFragmentManager,
            onNeedToRequestPermissions = { permissions ->
                ActivityCompat.requestPermissions(this, permissions, REQUEST_CODE_CAMERA_PERMISSIONS)
            },
            onScanResult = { pairingUrl ->
                launch {
                    val url = accountManager.beginAuthentication(
                        pairingUrl = pairingUrl,
                        entrypoint = SampleFxAEntryPoint.HomeMenu,
                        authScopes = scopes,
                    )
                    if (url == null) {
                        Log.log(
                            Log.Priority.ERROR,
                            tag = "mozac-samples-fxa",
                            message = "Pairing flow failed for $pairingUrl",
                        )
                        return@launch
                    }
                    openWebView(url)
                }
            },
            scanMessage = R.string.pair_instructions_message,
        )

        lifecycle.addObserver(qrFeature)

        findViewById<View>(R.id.buttonCustomTabs).setOnClickListener {
            launch {
                beginAuthentication()?.let { openTab(it) }
            }
        }

        findViewById<View>(R.id.buttonWebView).setOnClickListener {
            launch {
                beginAuthentication()?.let { openWebView(it) }
            }
        }

        findViewById<View>(R.id.buttonPair).setOnClickListener {
            qrFeature.scan()
        }

        findViewById<View>(R.id.buttonLogout).setOnClickListener {
            launch { accountManager.logout() }
        }

        findViewById<CheckBox>(R.id.checkboxKeys).setOnCheckedChangeListener { _, isChecked ->
            scopes = if (isChecked) scopesWithKeys else scopesWithoutKeys
        }
    }

    private suspend fun beginAuthentication(): String? =
        accountManager.beginAuthentication(entrypoint = SampleFxAEntryPoint.HomeMenu, authScopes = scopes)

    override fun onDestroy() {
        super.onDestroy()
        accountManager.close()
        job.cancel()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val action = intent.action
        val data = intent.dataString

        if (Intent.ACTION_VIEW == action && data != null) {
            val url = data.toUri()
            val code = url.getQueryParameter("code")!!
            val state = url.getQueryParameter("state")!!
            finishAuthentication(code, state)
        }
    }

    override fun onLoginComplete(code: String, state: String, fragment: LoginFragment) {
        finishAuthentication(code, state)
        supportFragmentManager.popBackStack()
    }

    private fun finishAuthentication(code: String, state: String) {
        launch {
            accountManager.finishAuthentication(FxaAuthData(AuthType.Signin, code = code, state = state))
        }
    }

    private fun openTab(url: String) {
        val customTabsIntent = CustomTabsIntent.Builder()
            .setShareState(CustomTabsIntent.SHARE_STATE_ON)
            .setShowTitle(true)
            .build()

        customTabsIntent.intent.data = url.toUri()
        customTabsIntent.launchUrl(this@MainActivity, url.toUri())
    }

    private fun openWebView(url: String) {
        supportFragmentManager.beginTransaction().apply {
            replace(R.id.container, LoginFragment.create(url, REDIRECT_URL))
            addToBackStack(null)
            commit()
        }
    }

    private fun displayProfile(profile: Profile) {
        val txtView: TextView = findViewById(R.id.txtView)
        txtView.text = getString(R.string.signed_in, "${profile.displayName ?: ""} ${profile.email}")
    }

    private val accountObserver = object : AccountObserver {
        override fun onAuthenticated(account: OAuthAccount, authType: AuthType) {
            launch {
                account.getProfile()?.let { displayProfile(it) }
            }
        }

        override fun onProfileUpdated(profile: Profile) {
            displayProfile(profile)
        }

        override fun onLoggedOut() {
            val txtView: TextView = findViewById(R.id.txtView)
            txtView.text = getString(R.string.logged_out)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        when (requestCode) {
            REQUEST_CODE_CAMERA_PERMISSIONS -> qrFeature.onPermissionsResult(permissions, grantResults)
            else -> super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        }
    }

    // https://bugzilla.mozilla.org/show_bug.cgi?id=1975910
    @Suppress("GestureBackNavigation", "MissingSuperCall", "OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        if (!qrFeature.onBackPressed()) {
            onBackPressedDispatcher.onBackPressed()
        }
    }
}
