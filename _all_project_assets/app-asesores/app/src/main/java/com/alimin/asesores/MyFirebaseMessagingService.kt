package com.alimin.asesores

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class MyFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "FCMService"

        /**
         * Canales de notificacion.
         *
         * Antes habia uno solo y todo sonaba igual: un lead nuevo, un mensaje de
         * un cliente y un recordatorio de seguimiento eran indistinguibles sin
         * mirar la pantalla. Ahora son tres, y cada uno se puede silenciar por
         * separado desde los ajustes del telefono sin perder los otros dos.
         *
         * El id del primero se mantiene tal cual estaba a proposito: es el que
         * declara el AndroidManifest como canal por omision, y cambiarlo dejaria
         * a los asesores con un canal huerfano ya configurado en su telefono.
         */
        private const val CANAL_LEADS = "crm_leads_channel"
        private const val CANAL_CHAT = "crm_chat_channel"
        private const val CANAL_SEGUIMIENTO = "crm_followup_channel"
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM token: $token")
        // Token will be sent to server when WebView loads
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        Log.d(TAG, "Message received from: ${message.from}")

        val title = message.notification?.title ?: message.data["title"] ?: "Nuevo Lead"
        val body = message.notification?.body ?: message.data["body"] ?: "Se te ha asignado un nuevo cliente"
        val leadId = message.data["leadId"]
        val tipo = message.data["type"] ?: ""

        showNotification(title, body, leadId, tipo)
    }

    /**
     * Elige el canal segun el tipo que manda el CRM.
     *
     * Cualquier tipo desconocido cae en el canal de leads en vez de descartarse.
     * Es deliberado: si manana el CRM inventa un tipo nuevo y esta app todavia
     * no lo conoce, el asesor igual escucha el aviso. Una notificacion en el
     * canal equivocado es un problema menor; una que nunca suena le cuesta un
     * cliente al negocio.
     */
    private fun canalPara(tipo: String): String = when {
        tipo.startsWith("FOLLOWUP") -> CANAL_SEGUIMIENTO
        tipo == "WEB_CHAT" || tipo == "CHAT" || tipo == "MESSAGE" -> CANAL_CHAT
        else -> CANAL_LEADS
    }

    private fun crearCanales(notificationManager: NotificationManager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val leads = NotificationChannel(
            CANAL_LEADS,
            "Leads Asignados",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notificaciones de nuevos leads asignados"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 300, 200, 300)
            setShowBadge(true)
        }

        val chat = NotificationChannel(
            CANAL_CHAT,
            "Mensajes de clientes",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Mensajes, fotos y audios que escriben los clientes por el chat de la web"
            enableVibration(true)
            // Vibracion mas corta y doble: se distingue de un lead nuevo con el
            // telefono en el bolsillo, sin tener que mirar.
            vibrationPattern = longArrayOf(0, 150, 100, 150)
            setShowBadge(true)
        }

        val seguimiento = NotificationChannel(
            CANAL_SEGUIMIENTO,
            "Recordatorios de seguimiento",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Avisos de clientes que llevan rato esperando sin que nadie los contacte"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 500, 250, 500)
            setShowBadge(true)
        }

        // createNotificationChannels es idempotente: volver a crear un canal que
        // ya existe no pisa lo que el asesor haya cambiado en los ajustes.
        notificationManager.createNotificationChannels(listOf(leads, chat, seguimiento))
    }

    private fun showNotification(title: String, body: String, leadId: String?, tipo: String) {
        val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        crearCanales(notificationManager)

        val canal = canalPara(tipo)

        // Intent to open the app when notification is tapped
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (leadId != null) {
                putExtra("leadId", leadId)
            }
        }

        // El requestCode tiene que ser distinto por lead: con uno fijo, Android
        // reutiliza el PendingIntent anterior y todas las notificaciones abren
        // la ficha del primer lead que llego.
        val pendingIntent = PendingIntent.getActivity(
            this,
            leadId?.hashCode() ?: 0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val notification = NotificationCompat.Builder(this, canal)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setSound(defaultSoundUri)
            .setVibrate(longArrayOf(0, 300, 200, 300))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .build()

        // Los recordatorios de seguimiento de un mismo lead se reemplazan entre
        // si: el de 30 minutos pisa al de 5, y el del dia pisa a los dos. Sin
        // esto el asesor termina con tres avisos apilados del mismo cliente, que
        // es ruido, no informacion.
        //
        // Todo lo demas usa un id unico para que no se pisen mensajes distintos.
        val notificationId = if (tipo.startsWith("FOLLOWUP") && leadId != null) {
            leadId.hashCode()
        } else {
            System.currentTimeMillis().toInt()
        }

        notificationManager.notify(notificationId, notification)
    }
}
