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
        effects = NexusEffectManager(applicationContext).also { it.start() }

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
        // Effects live only while the app process lives; Android may stop the process in the background.
        effects.stop()
        web.destroy()
        super.onDestroy()
    }

    inner class Bridge {
        @JavascriptInterface fun apply(planJson: String): String = effects.apply(planJson)
        @JavascriptInterface fun status(): String = effects.status()
        @JavascriptInterface fun openClassic() { runOnUiThread { startActivity(Intent(this@StudioActivity, MainActivity::class.java)) } }
    }
}
