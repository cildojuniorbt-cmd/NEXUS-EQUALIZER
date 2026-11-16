package com.nexus.equalizer

import android.media.audiofx.BassBoost

/**
 * Best-effort Android output-mix BassBoost.
 * Session 0 is deprecated and global routing depends on the device/OEM.
 */
class SystemBassBoostController {
    data class Status(
        val available: Boolean,
        val message: String,
        val enabled: Boolean = false,
        val strengthSupported: Boolean = false,
        val strength: Int = 0
    )

    private var effect: BassBoost? = null

    fun connect(): Status {
        release()
        return try {
            val candidate = BassBoost(0, 0)
            effect = candidate
            if (!candidate.hasControl()) {
                Status(false, "Bass Engine detectado, mas o controle está com outro serviço.")
            } else {
                val supported = candidate.strengthSupported
                Status(
                    true,
                    "Bass Engine disponível. A aplicação ao áudio de outros apps depende da rota do aparelho.",
                    candidate.enabled,
                    supported,
                    if (supported) candidate.roundedStrength.toInt().coerceIn(0, 1000) else 0
                )
            }
        } catch (error: Exception) {
            effect = null
            Status(false, "Bass Engine indisponível: ${error.javaClass.simpleName}.")
        }
    }

    fun setEnabled(enabled: Boolean): Boolean {
        val current = effect ?: return false
        return try {
            if (!current.hasControl()) return false
            current.enabled = enabled
            current.enabled == enabled
        } catch (_: Exception) { false }
    }

    fun setStrength(value: Int): Boolean {
        val current = effect ?: return false
        return try {
            if (!current.hasControl() || !current.strengthSupported) return false
            current.setStrength(value.coerceIn(0, 1000).toShort())
            true
        } catch (_: Exception) { false }
    }

    fun release() {
        try { effect?.release() } catch (_: Exception) { }
        effect = null
    }
}
