package com.alimin.asesores

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Log
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.google.firebase.messaging.FirebaseMessaging
import java.io.File

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

    // ---------------------------------------------------------------------
    // Adjuntos: fotos y videos
    // ---------------------------------------------------------------------
    //
    // Cuando la pagina abre un <input type="file">, el WebView no hace nada por
    // su cuenta: le pregunta a la app que quiere hacer, a traves de
    // onShowFileChooser. Si la app no responde, el boton de adjuntar del CRM
    // queda muerto -- que es exactamente lo que pasaba en la version anterior de
    // esta app.
    //
    // El contrato es estricto y hay que respetarlo: a filePathCallback se le
    // tiene que llamar EXACTAMENTE una vez. Si no se llama (por ejemplo, porque
    // el asesor cancelo el selector), el input queda bloqueado y no vuelve a
    // abrirse hasta recargar la pagina.

    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    /** Archivo temporal donde la app de camara escribe la foto recien tomada. */
    private var uriDeCaptura: Uri? = null
    private var archivoDeCaptura: File? = null

    private val selectorDeArchivos = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { resultado -> entregarArchivoAlWebView(resultado) }

    private val permisoDeMicrofono = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { concedido ->
        val solicitud = solicitudDeMicrofonoPendiente
        solicitudDeMicrofonoPendiente = null

        if (solicitud == null) return@registerForActivityResult

        if (concedido) {
            solicitud.grant(solicitud.resources)
        } else {
            // Se rechaza explicitamente en vez de dejar la promesa colgada: asi
            // getUserMedia falla de inmediato y el CRM alcanza a mostrar su
            // mensaje explicando que hay que dar el permiso en los ajustes.
            solicitud.deny()
        }
    }

    /** Peticion de microfono del WebView esperando la respuesta de Android. */
    private var solicitudDeMicrofonoPendiente: PermissionRequest? = null

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

                // Los audios y videos del chat se reproducen al tocar el boton
                // de play, que ya es un gesto del usuario. Esto es para que el
                // WebView no exija ademas un gesto previo en la pagina, cosa que
                // en algunos fabricantes deja el primer play sin efecto.
                mediaPlaybackRequiresUserGesture = false

                // La pagina nunca necesita leer archivos del telefono por su
                // cuenta: los adjuntos llegan por el selector, que entrega un
                // permiso acotado a ese archivo.
                allowFileAccess = false
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

            webChromeClient = ClienteConAdjuntos()

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

    /**
     * WebChromeClient que sabe abrir el selector de archivos y pedir el
     * microfono. Es la unica diferencia de fondo entre esta version de la app y
     * la anterior en cuanto a adjuntos.
     */
    private inner class ClienteConAdjuntos : WebChromeClient() {

        override fun onShowFileChooser(
            webView: WebView?,
            callback: ValueCallback<Array<Uri>>?,
            params: FileChooserParams?
        ): Boolean {
            // Si quedo un selector abierto de antes, se cierra su callback
            // primero. Dejar dos vivos rompe el WebView.
            filePathCallback?.onReceiveValue(null)
            filePathCallback = callback

            val tipos = params?.acceptTypes?.filter { it.isNotBlank() } ?: emptyList()
            val aceptaImagen = tipos.isEmpty() || tipos.any { it.startsWith("image/") || it == "*/*" }
            val aceptaVideo = tipos.isEmpty() || tipos.any { it.startsWith("video/") || it == "*/*" }

            val intentDeGaleria = Intent(Intent.ACTION_GET_CONTENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = when {
                    aceptaImagen && aceptaVideo -> "*/*"
                    aceptaVideo -> "video/*"
                    else -> "image/*"
                }
                if (aceptaImagen && aceptaVideo) {
                    putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/*", "video/*"))
                }
            }

            // Ademas de la galeria se ofrece la camara. Un asesor en terreno
            // casi siempre quiere sacar la foto en el momento, no buscarla.
            val extras = mutableListOf<Intent>()

            if (aceptaImagen) {
                crearIntentDeCamara()?.let { extras.add(it) }
            }
            if (aceptaVideo) {
                extras.add(Intent(MediaStore.ACTION_VIDEO_CAPTURE))
            }

            val selector = Intent.createChooser(intentDeGaleria, "Adjuntar al chat").apply {
                if (extras.isNotEmpty()) {
                    putExtra(Intent.EXTRA_INITIAL_INTENTS, extras.toTypedArray())
                }
            }

            return try {
                selectorDeArchivos.launch(selector)
                true
            } catch (e: Exception) {
                Log.e(TAG, "No se pudo abrir el selector de archivos", e)
                // Devolver el callback en null y false deja al WebView en un
                // estado limpio: el input se puede volver a tocar.
                filePathCallback = null
                callback?.onReceiveValue(null)
                false
            }
        }

        /**
         * El chat pide el microfono para grabar un mensaje de voz.
         *
         * El WebView tiene su propio sistema de permisos, separado del de
         * Android: aunque la app tenga RECORD_AUDIO concedido, la pagina no
         * puede grabar hasta que la app conceda tambien aca. Y al reves: no
         * sirve conceder aca si Android no nos dio el permiso. Hay que resolver
         * los dos, en ese orden.
         */
        override fun onPermissionRequest(request: PermissionRequest?) {
            if (request == null) return

            // Solo se responde a peticiones del propio CRM. Si alguna vez el
            // WebView terminara en otra pagina, no debe poder pedir el
            // microfono del telefono.
            val origen = request.origin?.host ?: ""
            if (!origen.endsWith("aliminlomasdelmar.com")) {
                request.deny()
                return
            }

            val quiereMicrofono = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
            if (!quiereMicrofono) {
                request.deny()
                return
            }

            val yaConcedido = ContextCompat.checkSelfPermission(
                this@MainActivity, Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED

            if (yaConcedido) {
                request.grant(request.resources)
                return
            }

            solicitudDeMicrofonoPendiente = request
            permisoDeMicrofono.launch(Manifest.permission.RECORD_AUDIO)
        }

        override fun onPermissionRequestCanceled(request: PermissionRequest?) {
            solicitudDeMicrofonoPendiente = null
        }
    }

    /**
     * Prepara el intent de camara con un archivo temporal propio.
     *
     * Sin pasarle un destino, muchas camaras devuelven una miniatura en vez de
     * la foto completa, y el asesor termina mandando una imagen ilegible.
     */
    private fun crearIntentDeCamara(): Intent? {
        return try {
            val carpeta = File(cacheDir, "capturas").apply { mkdirs() }
            val archivo = File(carpeta, "foto-${System.currentTimeMillis()}.jpg")

            val uri = FileProvider.getUriForFile(
                this, "${packageName}.fileprovider", archivo
            )
            uriDeCaptura = uri
            archivoDeCaptura = archivo

            Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, uri)
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            }
        } catch (e: Exception) {
            Log.e(TAG, "No se pudo preparar la camara", e)
            uriDeCaptura = null
            archivoDeCaptura = null
            null
        }
    }

    /** Devuelve al WebView el archivo elegido, o null si el asesor cancelo. */
    private fun entregarArchivoAlWebView(resultado: ActivityResult) {
        val callback = filePathCallback
        filePathCallback = null

        if (callback == null) return

        if (resultado.resultCode != RESULT_OK) {
            limpiarCapturaSinUsar()
            callback.onReceiveValue(null)
            return
        }

        val datos = resultado.data

        // La camara no devuelve datos: escribio en el archivo que le pasamos.
        // La galeria si devuelve un Uri, y en ese caso el archivo de la camara
        // (si se llego a crear) queda sin usar y hay que borrarlo.
        val uri = datos?.data ?: uriDeCaptura

        if (datos?.data != null) {
            limpiarCapturaSinUsar()
        }

        uriDeCaptura = null
        archivoDeCaptura = null

        if (uri == null) {
            callback.onReceiveValue(null)
        } else {
            callback.onReceiveValue(arrayOf(uri))
        }
    }

    /**
     * Borra el archivo temporal de camara cuando no se termino usando.
     *
     * Sin esto, cada vez que el asesor abre el selector y elige una foto de la
     * galeria (o cancela) queda un archivo vacio en la cache de la app.
     */
    private fun limpiarCapturaSinUsar() {
        val archivo = archivoDeCaptura
        archivoDeCaptura = null
        uriDeCaptura = null
        try {
            archivo?.delete()
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo borrar la captura sin usar", e)
        }
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
