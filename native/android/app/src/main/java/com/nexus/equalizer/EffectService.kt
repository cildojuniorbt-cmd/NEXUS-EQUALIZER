package com.nexus.equalizer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** Keeps the process (and the audio-session listener) alive while NEXUS EQ is processing audio. */
class EffectService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        NexusEffectManager.get(this).start()
        if (Build.VERSION.SDK_INT >= 26) {
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(NotificationChannel("nexus_fx", "NEXUS EQ ativo", NotificationManager.IMPORTANCE_LOW))
        }
        val n = (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "nexus_fx") else @Suppress("DEPRECATION") Notification.Builder(this))
            .setContentTitle("NEXUS EQ ativo")
            .setContentText("Processando o áudio dos apps compatíveis")
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
            .setOngoing(true)
            .setContentIntent(android.app.PendingIntent.getActivity(this, 0, Intent(this, StudioActivity::class.java), android.app.PendingIntent.FLAG_IMMUTABLE))
            .build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK) else startForeground(1, n)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        NexusEffectManager.get(this).stop()
        super.onDestroy()
    }
}
