package com.nexus.equalizer

import org.json.JSONArray
import org.json.JSONObject

/** Plan v1 sent by the web UI (src/native/plan.ts). Pure data: no Android classes, so it is unit-testable on the JVM. */
data class PlanCompressor(
    val enabled: Boolean, val thresholdDb: Float, val ratio: Float, val attackMs: Float,
    val releaseMs: Float, val kneeDb: Float, val makeupDb: Float
)

data class PlanBand(val comp: PlanCompressor, val gainDb: Float)

data class NexusPlan(
    val enabled: Boolean,
    val preampDb: Float,
    val inputTrimDb: Float,
    val outputDb: Float,
    val eqFreqs: DoubleArray,
    val eqGainsDb: FloatArray,
    val compressor: PlanCompressor,
    val multibandEnabled: Boolean,
    val crossLow: Float,
    val crossHigh: Float,
    val bands: List<PlanBand>,
    val gateEnabled: Boolean,
    val gateThresholdDb: Float,
    val expanderEnabled: Boolean,
    val expanderThresholdDb: Float,
    val expanderRatio: Float,
    val limiterEnabled: Boolean,
    val limiterCeilingDb: Float,
    val limiterReleaseMs: Float,
    val unsupported: List<String>
) {
    companion object {
        const val VERSION = 1

        private fun comp(o: JSONObject, enabled: Boolean = o.optBoolean("enabled", false)) = PlanCompressor(
            enabled,
            o.optDouble("thresholdDb", -18.0).toFloat(), o.optDouble("ratio", 1.0).toFloat(),
            o.optDouble("attackMs", 10.0).toFloat(), o.optDouble("releaseMs", 120.0).toFloat(),
            o.optDouble("kneeDb", 6.0).toFloat(), o.optDouble("makeupDb", 0.0).toFloat()
        )

        fun parse(json: String): NexusPlan {
            val o = JSONObject(json)
            require(o.optInt("version", 0) == VERSION) { "Versão de plano não suportada" }
            val eq = o.getJSONObject("eq")
            val freqs = eq.getJSONArray("freqs")
            val gains = eq.getJSONArray("gainsDb")
            require(freqs.length() == gains.length() && freqs.length() in 1..64) { "Curva de EQ inválida" }
            val mb = o.getJSONObject("multiband")
            val bandArr: JSONArray = mb.getJSONArray("bands")
            val gate = o.getJSONObject("gate")
            val exp = o.getJSONObject("expander")
            val lim = o.getJSONObject("limiter")
            val unsupported = o.optJSONArray("unsupported")
            return NexusPlan(
                enabled = o.optBoolean("enabled", false),
                preampDb = o.optDouble("preampDb", 0.0).toFloat(),
                inputTrimDb = o.optDouble("inputTrimDb", 0.0).toFloat(),
                outputDb = o.optDouble("outputDb", 0.0).toFloat(),
                eqFreqs = DoubleArray(freqs.length()) { freqs.getDouble(it) },
                eqGainsDb = FloatArray(gains.length()) { gains.getDouble(it).toFloat() },
                compressor = comp(o.getJSONObject("compressor")),
                multibandEnabled = mb.optBoolean("enabled", false),
                crossLow = mb.optDouble("crossLow", 200.0).toFloat(),
                crossHigh = mb.optDouble("crossHigh", 2500.0).toFloat(),
                bands = (0 until bandArr.length()).map { PlanBand(comp(bandArr.getJSONObject(it)), bandArr.getJSONObject(it).optDouble("gainDb", 0.0).toFloat()) },
                gateEnabled = gate.optBoolean("enabled", false),
                gateThresholdDb = gate.optDouble("thresholdDb", -55.0).toFloat(),
                expanderEnabled = exp.optBoolean("enabled", false),
                expanderThresholdDb = exp.optDouble("thresholdDb", -45.0).toFloat(),
                expanderRatio = exp.optDouble("ratio", 2.0).toFloat(),
                limiterEnabled = lim.optBoolean("enabled", true),
                limiterCeilingDb = lim.optDouble("ceilingDb", -0.3).toFloat(),
                limiterReleaseMs = lim.optDouble("releaseMs", 80.0).toFloat(),
                unsupported = if (unsupported == null) emptyList() else (0 until unsupported.length()).map { unsupported.getString(it) }
            )
        }
    }
}
