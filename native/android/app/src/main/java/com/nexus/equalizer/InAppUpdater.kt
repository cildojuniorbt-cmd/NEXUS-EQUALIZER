package com.nexus.equalizer

import android.app.Activity
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

object InAppUpdater {
    data class Update(
        val version: String,
        val notes: String,
        val apkUrl: String
    )

    private const val RELEASE_API =
        "https://api.github.com/repos/cildojuniorbt-cmd/NEXUS-EQUALIZER/releases/latest"
    private val executor = Executors.newSingleThreadExecutor()

    fun check(activity: Activity, callback: (Result<Update?>) -> Unit) {
        executor.execute {
            val result = runCatching {
                val connection = (URL(RELEASE_API).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 12000
                    readTimeout = 12000
                    setRequestProperty("Accept", "application/vnd.github+json")
                    setRequestProperty("User-Agent", "NEXUS-EQUALIZER-Android")
                }
                try {
                    if (connection.responseCode == 404) error("Ainda não há uma versão publicada para atualização.")
                    if (connection.responseCode != 200) error("Servidor de atualizações indisponível (HTTP ${connection.responseCode}).")
                    val release = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                    val tag = release.optString("tag_name").removePrefix("v")
                    val apk = release.getJSONArray("assets").let { assets ->
                        (0 until assets.length()).map { assets.getJSONObject(it) }
                            .firstOrNull { it.optString("name").endsWith(".apk", true) }
                    } ?: error("Esta versão ainda não possui APK publicado.")
                    if (compareVersions(tag, BuildConfig.VERSION_NAME) <= 0) null
                    else Update(tag, release.optString("body"), apk.getString("browser_download_url"))
                } finally {
                    connection.disconnect()
                }
            }
            activity.runOnUiThread { callback(result) }
        }
    }

    fun downloadAndInstall(activity: Activity, update: Update, callback: (String) -> Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()
        ) {
            callback("Autorize a instalação de atualizações para o NEXUS EQUALIZER nas configurações que serão abertas.")
            val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                data = Uri.parse("package:" + activity.packageName)
            }
            activity.startActivity(intent)
            return
        }

        val request = DownloadManager.Request(Uri.parse(update.apkUrl))
            .setTitle("NEXUS EQUALIZER ${update.version}")
            .setDescription("Baixando atualização")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, "nexus-equalizer-update.apk")
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(false)

        val manager = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val downloadId = manager.enqueue(request)
        callback("Download iniciado. O Android avisará quando estiver pronto para instalar.")

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) != downloadId) return
                try {
                    val query = DownloadManager.Query().setFilterById(downloadId)
                    manager.query(query).use { cursor ->
                        if (!cursor.moveToFirst()) return
                        val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                        if (cursor.getInt(statusIndex) != DownloadManager.STATUS_SUCCESSFUL) {
                            callback("Não foi possível baixar a atualização.")
                            return
                        }
                    }
                    val file = File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "nexus-equalizer-update.apk")
                    if (!file.exists() || file.length() == 0L) {
                        callback("O arquivo da atualização não foi encontrado.")
                        return
                    }
                    val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
                    val install = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, "application/vnd.android.package-archive")
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    activity.startActivity(install)
                    callback("Download concluído. Confirme a instalação na tela do Android.")
                } catch (error: Exception) {
                    callback("Falha ao preparar a instalação: ${error.javaClass.simpleName}")
                } finally {
                    try {
                        if (Build.VERSION.SDK_INT >= 33) activity.unregisterReceiver(this)
                        else activity.unregisterReceiver(this)
                    } catch (_: Exception) { }
                }
            }
        }
        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        else @Suppress("DEPRECATION") activity.registerReceiver(receiver, filter)
    }

    private fun compareVersions(remote: String, local: String): Int {
        val a = remote.split(".").map { it.toIntOrNull() ?: 0 }
        val b = local.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(a.size, b.size)) {
            val diff = (a.getOrNull(i) ?: 0).compareTo(b.getOrNull(i) ?: 0)
            if (diff != 0) return diff
        }
        return 0
    }
}
