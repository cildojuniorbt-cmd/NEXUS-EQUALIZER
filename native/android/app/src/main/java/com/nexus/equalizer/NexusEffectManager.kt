package com.nexus.equalizer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.audiofx.AudioEffect
import android.os.Build
import org.json.JSONObject

/**
 * Keeps the latest plan and applies it to (a) the global output mix, best effort, and (b) every audio session
 * that an app announces with ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION. Android decides what is audible:
 * session 0 is deprecated and OEM-dependent, and apps that never announce their session cannot be reached.
 * The result is reported honestly through [status].
 */
class NexusEffectManager private constructor(private val context: Context) {
    companion object {
        @Volatile private var instance: NexusEffectManager? = null
        fun get(ctx: Context): NexusEffectManager = instance ?: synchronized(this) { instance ?: NexusEffectManager(ctx.applicationContext).also { instance = it } }
    }
    /** Sessions announced by apps (even before a plan exists); effects attach to them when a plan is enabled. */
    private val known = LinkedHashSet<Int>()

    private var plan: NexusPlan? = null
    private var global: Any? = null // NexusDynamicsController, kept as Any so API < 28 never loads the class
    private var globalReason: String? = null
    private val sessions = LinkedHashMap<Int, Any>()
    private var registered = false

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
            val id = intent.getIntExtra(AudioEffect.EXTRA_AUDIO_SESSION, -1)
            if (id <= 0 || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
            when (intent.action) {
                AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION -> synchronized(this@NexusEffectManager) { known.add(id); attachSession(id) }
                AudioEffect.ACTION_CLOSE_AUDIO_EFFECT_CONTROL_SESSION -> synchronized(this@NexusEffectManager) { known.remove(id); releaseSession(id) }
            }
        }
    }

    fun start() {
        if (registered) return
        val filter = IntentFilter().apply {
            addAction(AudioEffect.ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION)
            addAction(AudioEffect.ACTION_CLOSE_AUDIO_EFFECT_CONTROL_SESSION)
        }
        if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        else context.registerReceiver(receiver, filter)
        registered = true
    }

    fun stop() {
        if (registered) {
            try { context.unregisterReceiver(receiver) } catch (_: Exception) { }
            registered = false
        }
        releaseAll()
    }

    /** Called by the bridge with the JSON plan; returns the status JSON for the UI. */
    @Synchronized fun apply(json: String): String {
        val parsed = try { NexusPlan.parse(json) } catch (e: Exception) {
            return statusJson("unavailable", "Plano inválido: ${e.message}")
        }
        plan = parsed
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return statusJson("unavailable", "DynamicsProcessing exige Android 9 (API 28) ou superior.")
        if (!parsed.enabled) { releaseAll(); return statusJson("idle", "Desligado.") }
        applyGlobal(parsed)
        known.forEach { if (!sessions.containsKey(it)) attachSession(it) }
        sessions.values.forEach { (it as NexusDynamicsController).apply(parsed) }
        return status()
    }

    private fun applyGlobal(p: NexusPlan) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
        val g = (global as? NexusDynamicsController) ?: NexusDynamicsController(0).also { global = it }
        globalReason = g.apply(p)
        if (globalReason != null) global = null
    }

    private fun attachSession(id: Int) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
        val p = plan ?: return
        if (!p.enabled || sessions.containsKey(id)) return
        val c = NexusDynamicsController(id)
        if (c.apply(p) == null) sessions[id] = c
    }

    private fun releaseSession(id: Int) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) (sessions.remove(id) as? NexusDynamicsController)?.release()
    }

    private fun releaseAll() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            (global as? NexusDynamicsController)?.release()
            sessions.values.forEach { (it as NexusDynamicsController).release() }
        }
        global = null; sessions.clear()
    }

    @Synchronized fun isEnabled(): Boolean = plan?.enabled == true

    /** Sessions currently known (for diagnostics in the status text). */
    @Synchronized fun knownCount(): Int = known.size

    @Synchronized fun status(): String {
        val p = plan ?: return statusJson("idle", "Aguardando configuração.")
        if (!p.enabled) return statusJson("idle", "Desligado.")
        val globalOk = global != null
        val n = sessions.size
        return when {
            globalOk && n > 0 -> statusJson("active", "Ativo na saída global e em $n sessão(ões) de apps. O efeito real depende do aparelho.", n)
            globalOk -> statusJson("active", "Efeito global anexado. Em muitos aparelhos o Android ignora efeitos globais: confirme ouvindo.", 0)
            n > 0 -> statusJson("active", "Ativo em $n sessão(ões) de apps que anunciaram seu áudio. Outros apps não são afetados.", n)
            else -> statusJson("unavailable", "Este aparelho não aceitou o efeito global (${globalReason ?: "sem detalhe"}) e nenhum app anunciou sua sessão de áudio (conhecidas: ${known.size}). Abra um player compatível e dê play numa música nova.", 0)
        }
    }

    private fun statusJson(state: String, message: String, sessionCount: Int = sessions.size): String =
        JSONObject().put("platform", "android").put("state", state).put("message", message).put("sessions", sessionCount).put("api", Build.VERSION.SDK_INT).toString()
}
