package com.nexus.equalizer

import android.media.audiofx.LoudnessEnhancer

/**
 * Best-effort Android output-mix loudness enhancer.
 * Session 0 is deprecated for global output effects and OEM routing varies.
 */
class SystemLoudnessEnhancerController {
    data class Status(
        val available: Boolean,
        val message: String,
        val enabled: Boolean = false,
        val targetGain: Int = 0
    )

    private var effect: LoudnessEnhancer? = null

    fun connect(): Status {
        release()
        return try {
            val candidate = LoudnessEnhancer(0)
            effect = candidate
            if (!candidate.hasControl()) {
                Status(false, "Level Boost detectado, mas o controle está com outro serviço.")
            } else {
                Status(
                    true,
                    "Level Boost disponível. O resultado em outros apps depende da rota do aparelho.",
                    candidate.enabled,
                    candidate.targetGain.coerceIn(0f, 1000f).toInt()
                )
            }
        } catch (error: Exception) {
            effect = null
            Status(false, "Level Boost indisponível: ${error.javaClass.simpleName}.")
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

    fun setTargetGain(value: Int): Boolean {
        val current = effect ?: return false
        return try {
            if (!current.hasControl()) return false
            current.setTargetGain(value.coerceIn(0, 1000))
            true
        } catch (_: Exception) { false }
    }

    fun release() {
        try { effect?.release() } catch (_: Exception) { }
        effect = null
    }
}
