package com.nexus.equalizer

import kotlin.math.ln

enum class EqPreset(val title: String, val gainsDb: DoubleArray) {
    FLAT("Flat", doubleArrayOf(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)),
    BASS_BOOST("Bass Boost", doubleArrayOf(6.0, 5.0, 4.0, 2.0, 0.0, -1.0, -1.0, 0.0, 1.0, 1.0)),
    VOCAL("Vocal", doubleArrayOf(-3.0, -2.0, -1.0, 1.0, 3.0, 4.0, 3.0, 1.0, 0.0, -1.0)),
    ROCK("Rock", doubleArrayOf(4.0, 3.0, -1.0, -3.0, -1.0, 2.0, 4.0, 5.0, 5.0, 4.0)),
    POP("Pop", doubleArrayOf(-1.0, 1.0, 3.0, 4.0, 2.0, -1.0, 0.0, 2.0, 3.0, 2.0));

    companion object {
        val frequenciesHz = doubleArrayOf(32.0, 64.0, 125.0, 250.0, 500.0, 1_000.0, 2_000.0, 4_000.0, 8_000.0, 16_000.0)

        /** Interpolates preset gains in log-frequency space to the actual device bands. */
        fun gainAt(preset: EqPreset, frequencyHz: Double): Double {
            val f = frequencyHz.coerceIn(frequenciesHz.first(), frequenciesHz.last())
            val logF = ln(f)
            for (i in 0 until frequenciesHz.lastIndex) {
                val low = ln(frequenciesHz[i])
                val high = ln(frequenciesHz[i + 1])
                if (logF <= high) {
                    val t = ((logF - low) / (high - low)).coerceIn(0.0, 1.0)
                    return preset.gainsDb[i] + (preset.gainsDb[i + 1] - preset.gainsDb[i]) * t
                }
            }
            return preset.gainsDb.last()
        }
    }
}
