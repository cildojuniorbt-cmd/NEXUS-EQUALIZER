package com.nexus.equalizer

import android.media.audiofx.DynamicsProcessing
import android.os.Build
import androidx.annotation.RequiresApi

/**
 * Applies a [NexusPlan] to one audio session with Android's DynamicsProcessing (API 28+).
 * The stage layout (EQ band count, MBC band count) is fixed when the effect is created, so a plan with a
 * different layout recreates the effect; value-only changes are updated in place.
 */
@RequiresApi(Build.VERSION_CODES.P)
class NexusDynamicsController(private val sessionId: Int, private val priority: Int = 0) {
    private var effect: DynamicsProcessing? = null
    private var layout: Triple<Int, Int, Boolean>? = null

    val attached: Boolean get() = effect != null

    /** Returns null on success, otherwise a short reason. */
    fun apply(plan: NexusPlan): String? {
        return try {
            val eq = DynamicsMapper.eqBands(plan)
            val mbc = DynamicsMapper.mbcBands(plan)
            val lim = DynamicsMapper.limiter(plan)
            val wanted = Triple(eq.size, mbc.size, lim.enabled)
            if (effect == null || layout != wanted) create(eq.size, mbc.size, lim.enabled, wanted)
            val dp = effect ?: return "efeito indisponível"
            eq.forEachIndexed { i, b -> dp.setPreEqBandAllChannelsTo(i, DynamicsProcessing.EqBand(true, b.cutoffHz, b.gainDb)) }
            mbc.forEachIndexed { i, b ->
                dp.setMbcBandAllChannelsTo(i, DynamicsProcessing.MbcBand(true, b.cutoffHz, b.attackMs, b.releaseMs, b.ratio, b.thresholdDb, b.kneeDb, b.noiseGateDb, b.expanderRatio, b.preGainDb, b.postGainDb))
            }
            if (lim.enabled) dp.setLimiterAllChannelsTo(DynamicsProcessing.Limiter(true, true, 0, lim.attackMs, lim.releaseMs, lim.ratio, lim.thresholdDb, lim.postGainDb))
            dp.setInputGainAllChannelsTo(DynamicsMapper.inputGainDb(plan))
            dp.setEnabled(plan.enabled)
            null
        } catch (e: Exception) {
            release()
            "${e.javaClass.simpleName}: ${e.message ?: "falha ao aplicar"}"
        }
    }

    private fun create(eqBands: Int, mbcBands: Int, limiter: Boolean, key: Triple<Int, Int, Boolean>) {
        release()
        val config = DynamicsProcessing.Config.Builder(
            DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION, 2,
            true, eqBands, mbcBands > 0, maxOf(mbcBands, 1), false, 1, limiter
        ).build()
        effect = DynamicsProcessing(priority, sessionId, config)
        layout = key
    }

    fun release() {
        try { effect?.release() } catch (_: Exception) { /* already released */ }
        effect = null
        layout = null
    }
}
