package com.nexus.equalizer

import android.media.audiofx.Equalizer

/**
 * Best-effort legacy output-mix equalizer.
 *
 * Session 0 is deprecated for global output effects and is not supported consistently
 * across Android devices. Never infer global routing from successful construction alone.
 */
class SystemEqualizerController {
    enum class State { UNAVAILABLE, CONTROL_OWNED_ELSEWHERE, AVAILABLE_AND_CONTROLLED }

    data class Status(
        val state: State,
        val message: String,
        val bandCount: Int = 0,
        val minLevelMb: Int = 0,
        val maxLevelMb: Int = 0
    )

    private var effect: Equalizer? = null

    fun connect(): Status {
        release()
        return try {
            val candidate = Equalizer(0, 0)
            effect = candidate
            when {
                !candidate.hasControl() -> Status(
                    State.CONTROL_OWNED_ELSEWHERE,
                    "O efeito existe, mas o controle está com outro serviço."
                )
                candidate.numberOfBands <= 0 -> Status(
                    State.UNAVAILABLE,
                    "Este aparelho não disponibilizou bandas de equalização."
                )
                else -> {
                    val range = candidate.bandLevelRange
                    Status(
                        State.AVAILABLE_AND_CONTROLLED,
                        "O Android disponibilizou um efeito de saída. A aplicação real pode variar por aparelho.",
                        candidate.numberOfBands.toInt(),
                        range[0].toInt(),
                        range[1].toInt()
                    )
                }
            }
        } catch (error: Exception) {
            effect = null
            Status(
                State.UNAVAILABLE,
                "Equalização global indisponível neste aparelho: ${error.javaClass.simpleName}."
            )
        }
    }

    fun setBandLevel(index: Int, levelMb: Int): Boolean {
        val current = effect ?: return false
        return try {
            if (!current.hasControl() || index !in 0 until current.numberOfBands) return false
            val range = current.bandLevelRange
            current.setBandLevel(index.toShort(), levelMb.coerceIn(range[0].toInt(), range[1].toInt()).toShort())
            true
        } catch (_: Exception) {
            false
        }
    }

    fun setEnabled(enabled: Boolean): Boolean {
        val current = effect ?: return false
        return try {
            if (!current.hasControl()) return false
            current.enabled = enabled
            current.enabled == enabled
        } catch (_: Exception) {
            false
        }
    }

    fun release() {
        try { effect?.release() } catch (_: Exception) { }
        effect = null
    }
}
