package com.alimin.asesores

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private val TAG = "MainActivity"

    // Permission launcher for notifications (Android 13+)
    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        Log.d(TAG, "Notification permission granted: $isGranted")
        if (isGranted) {
            getAndSendFcmToken()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Ensure status bar is visible
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        
        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                loadsImagesAutomatically = true
                setSupportZoom(false)
            }
            
            // Add JavaScript interface so the web app can receive the FCM token
            addJavascriptInterface(WebAppInterface(), "AndroidBridge")
            
            webViewClient = object : WebViewClient() {
                @Deprecated("Deprecated in Java", ReplaceWith("false"))
                override fun shouldOverrideUrlLoading(view: WebView?, url: String): Boolean {
                    if (url.startsWith("tel:") || url.startsWith("whatsapp:") || url.startsWith("https://wa.me") || url.startsWith("mailto:")) {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        startActivity(intent)
                        return true
                    }
                    return false
                }

                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val url = request?.url.toString()
                    if (url.startsWith("tel:") || url.startsWith("whatsapp:") || url.startsWith("https://wa.me") || url.startsWith("mailto:")) {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        startActivity(intent)
                        return true
                    }
                    return false
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    // Once page is loaded, send the FCM token
                    getAndSendFcmToken()
                }
            }
            
            webChromeClient = WebChromeClient()

            // Check if opened from a notification with a valid leadId
            val leadId = intent?.getStringExtra("leadId")
            val url = if (!leadId.isNullOrEmpty()) {
                "https://crm.aliminlomasdelmar.com/dashboard/leads/$leadId"
            } else {
                "https://crm.aliminlomasdelmar.com/"
            }
            
            loadUrl(url)
        }
        
        setContentView(webView)

        // Request notification permission for Android 13+
        askNotificationPermission()
    }

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) 
                != PackageManager.PERMISSION_GRANTED) {
                requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun getAndSendFcmToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                Log.w(TAG, "FCM token fetch failed", task.exception)
                return@addOnCompleteListener
            }
            val token = task.result
            fcmTokenCache = token
            Log.d(TAG, "FCM Token (Cached for Web): $token")
            
            // Inject the token into the WebView via JavaScript
            runOnUiThread {
                webView.evaluateJavascript(
                    """
                    (function() {
                        if (window.__FCM_TOKEN_SENT) return;
                        window.__FCM_TOKEN_SENT = true;
                        fetch('/api/user/fcm-token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ token: '$token' })
                        }).then(r => {
                            if (!r.ok) {
                                window.__FCM_TOKEN_SENT = false; // Retry next time if failed (e.g., logged out 401)
                            }
                            console.log('FCM token saved:', r.status);
                        }).catch(e => {
                            window.__FCM_TOKEN_SENT = false; // Retry next time if network error
                            console.error('FCM token save error:', e);
                        });
                    })();
                    """.trimIndent(),
                    null
                )
            }
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    private var fcmTokenCache: String = ""

    // ... inside MainActivity ...
    // JavaScript interface for web → native communication
    inner class WebAppInterface {
        @JavascriptInterface
        fun getFcmToken(): String {
            return fcmTokenCache
        }

        @JavascriptInterface
        fun openNotificationSettings() {
            try {
                val intent = Intent().apply {
                    action = android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS
                    putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, packageName)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Error opening notification settings", e)
                // Fallback to application details settings if notification settings fails
                try {
                    val intent = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.fromParts("package", packageName, null)
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    startActivity(intent)
                } catch (e2: Exception) {
                    Log.e(TAG, "Fallback also failed", e2)
                }
            }
        }
    }
}
