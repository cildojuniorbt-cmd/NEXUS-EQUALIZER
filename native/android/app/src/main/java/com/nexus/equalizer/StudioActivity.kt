package com.nexus.equalizer

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import androidx.webkit.WebViewAssetLoader

/**
 * NEXUS EQ Studio: the SAME web UI (design system) that ships on iOS and the browser, loaded from the app's
 * assets over a secure origin. The UI reduces its configuration to a plan and sends it through [Bridge];
 * [NexusEffectManager] applies it with DynamicsProcessing.
 */
class StudioActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var effects: NexusEffectManager

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.parseColor("#0B0B0D")
        window.navigationBarColor = Color.parseColor("#0B0B0D")
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        effects = NexusEffectManager.get(applicationContext).also { it.start() }
        if (android.os.Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 1)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0B0B0D"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            addJavascriptInterface(Bridge(), "NexusNative")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? = loader.shouldInterceptRequest(request.url)
                // Only the bundled origin may load inside the WebView.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = request.url.host != WebViewAssetLoader.DEFAULT_DOMAIN
            }
            webChromeClient = object : WebChromeClient() {
                // Microphone access for the in-app measurement tools; the origin is the bundled one only.
                override fun onPermissionRequest(request: PermissionRequest) {
                    if (request.origin.host == WebViewAssetLoader.DEFAULT_DOMAIN) request.grant(request.resources) else request.deny()
                }
            }
        }
        setContentView(web)
        web.loadUrl("https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/studio/index.html")
    }

    @Deprecated("Activity API")
    override fun onBackPressed() { if (web.canGoBack()) web.goBack() else super.onBackPressed() }

    override fun onDestroy() {
        // Effects keep running through EffectService while it is on; the UI is only a remote control.
        web.destroy()
        super.onDestroy()
    }

    @Volatile private var pendingUpdate: InAppUpdater.Update? = null

    private fun notifyUpdateUi(payload: JSONObject) {
        val encoded = JSONObject.quote(payload.toString())
        runOnUiThread { if (::web.isInitialized) web.evaluateJavascript("window.__nexusUpdateResult && window.__nexusUpdateResult($encoded)", null) }
    }

    inner class Bridge {
        @JavascriptInterface fun apply(planJson: String): String {
            val result = effects.apply(planJson)
            runOnUiThread {
                val svc = Intent(this@StudioActivity, EffectService::class.java)
                val on = effects.isEnabled()
                try { if (on) startForegroundService(svc) else stopService(svc) } catch (_: Exception) { }
            }
            return result
        }
        @JavascriptInterface fun status(): String = effects.status()
        @JavascriptInterface fun checkUpdates() {
            InAppUpdater.check(this@StudioActivity) { result ->
                result.onSuccess { update ->
                    pendingUpdate = update
                    val payload = if (update == null) JSONObject().put("status", "current").put("message", "Você já está usando a versão mais recente.")
                    else JSONObject().put("status", "available").put("version", update.version).put("notes", update.notes).put("message", "Nova versão disponível: ${update.version}")
                    notifyUpdateUi(payload)
                }.onFailure { error ->
                    pendingUpdate = null
                    notifyUpdateUi(JSONObject().put("status", "error").put("message", error.message ?: "Não foi possível verificar atualizações."))
                }
            }
        }
        @JavascriptInterface fun installUpdate() {
            val update = pendingUpdate
            if (update == null) { notifyUpdateUi(JSONObject().put("status", "error").put("message", "Verifique atualizações novamente antes de instalar.")); return }
            InAppUpdater.downloadAndInstall(this@StudioActivity, update) { message ->
                notifyUpdateUi(JSONObject().put("status", "installing").put("message", message).put("version", update.version).put("notes", update.notes))
            }
        }
        @JavascriptInterface fun openClassic() { runOnUiThread { startActivity(Intent(this@StudioActivity, MainActivity::class.java)) } }
    }
}
