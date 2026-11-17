package com.nexus.equalizer

import kotlin.math.sqrt

/**
 * Pure mapping from [NexusPlan] to the parameters Android's DynamicsProcessing expects.
 * No android.* imports on purpose: the unit tests run on the JVM and verify the numbers.
 */
object DynamicsMapper {
    const val MAX_EQ_GAIN_DB = 15f
    const val NYQUIST_GUARD_HZ = 20000f

    data class EqBandSpec(val cutoffHz: Float, val gainDb: Float)
    data class MbcBandSpec(
        val cutoffHz: Float, val attackMs: Float, val releaseMs: Float, val ratio: Float, val thresholdDb: Float,
        val kneeDb: Float, val noiseGateDb: Float, val expanderRatio: Float, val preGainDb: Float, val postGainDb: Float
    )
    data class LimiterSpec(val enabled: Boolean, val attackMs: Float, val releaseMs: Float, val ratio: Float, val thresholdDb: Float, val postGainDb: Float)

    /** DynamicsProcessing EQ bands are contiguous: each band's cutoff is its UPPER edge. Edges sit between centres (geometric mean). */
    fun eqBands(plan: NexusPlan, sampleRate: Int = 48000): List<EqBandSpec> {
        val top = minOf(NYQUIST_GUARD_HZ, sampleRate / 2f - 100f)
        val n = plan.eqFreqs.size
        return List(n) { i ->
            val edge = if (i == n - 1) top else sqrt(plan.eqFreqs[i] * plan.eqFreqs[i + 1]).toFloat().coerceAtMost(top)
            EqBandSpec(edge, plan.eqGainsDb[i].coerceIn(-MAX_EQ_GAIN_DB, MAX_EQ_GAIN_DB))
        }
    }

    /** Gain applied before the effect chain: pre-amp (auto-protection) + input trim + any positive output gain (the limiter catches the peaks). */
    fun inputGainDb(plan: NexusPlan): Float = plan.preampDb + plan.inputTrimDb + maxOf(plan.outputDb, 0f)

    private fun gateAndExpander(plan: NexusPlan): Pair<Float, Float> = when {
        plan.gateEnabled -> plan.gateThresholdDb to 20f           // hard gate: strong downward expansion
        plan.expanderEnabled -> plan.expanderThresholdDb to plan.expanderRatio.coerceIn(1f, 10f)
        else -> -90f to 1f                                        // off
    }

    private fun mbc(c: PlanCompressor, cutoff: Float, extraGain: Float, gate: Pair<Float, Float>): MbcBandSpec =
        if (c.enabled) MbcBandSpec(cutoff, c.attackMs.coerceIn(0.1f, 500f), c.releaseMs.coerceIn(1f, 5000f), c.ratio.coerceIn(1f, 20f), c.thresholdDb.coerceIn(-80f, 0f),
            c.kneeDb.coerceIn(0f, 24f), gate.first, gate.second, 0f, c.makeupDb + extraGain)
        else MbcBandSpec(cutoff, 10f, 100f, 1f, 0f, 0f, gate.first, gate.second, 0f, extraGain)

    /** Empty list = the MBC stage is not needed (no compression, gate or expander active). */
    fun mbcBands(plan: NexusPlan): List<MbcBandSpec> {
        val gate = gateAndExpander(plan)
        val gateOn = plan.gateEnabled || plan.expanderEnabled
        if (plan.multibandEnabled && plan.bands.size == 3) {
            val cuts = floatArrayOf(plan.crossLow, plan.crossHigh, NYQUIST_GUARD_HZ)
            return plan.bands.mapIndexed { i, b -> mbc(b.comp, cuts[i], b.gainDb, gate) }
        }
        if (plan.compressor.enabled || gateOn) return listOf(mbc(plan.compressor, NYQUIST_GUARD_HZ, 0f, gate))
        return emptyList()
    }

    fun limiter(plan: NexusPlan): LimiterSpec =
        LimiterSpec(plan.limiterEnabled, 1f, plan.limiterReleaseMs.coerceIn(10f, 1000f), 20f, plan.limiterCeilingDb.coerceIn(-12f, 0f), minOf(plan.outputDb, 0f))

    /** True when the plan changes nothing audible (used to avoid keeping an effect attached for no reason). */
    fun isTransparent(plan: NexusPlan): Boolean =
        plan.eqGainsDb.all { kotlin.math.abs(it) < 0.05f } && inputGainDb(plan) == 0f && mbcBands(plan).isEmpty() && !plan.limiterEnabled && plan.outputDb == 0f
}
