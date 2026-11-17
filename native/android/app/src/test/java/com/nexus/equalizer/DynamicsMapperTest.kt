package com.nexus.equalizer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class DynamicsMapperTest {
    private val freqs = doubleArrayOf(20.0, 25.0, 31.5, 40.0, 50.0, 63.0, 80.0, 100.0, 125.0, 160.0, 200.0, 250.0, 315.0, 400.0, 500.0, 630.0, 800.0, 1000.0, 1250.0, 1600.0, 2000.0, 2500.0, 3150.0, 4000.0, 5000.0, 6300.0, 8000.0, 10000.0, 12500.0, 16000.0, 20000.0)
    private val off = PlanCompressor(false, -18f, 4f, 10f, 120f, 6f, 0f)

    private fun plan(
        gains: FloatArray = FloatArray(freqs.size),
        comp: PlanCompressor = off,
        multiband: Boolean = false,
        gate: Boolean = false,
        expander: Boolean = false,
        limiter: Boolean = true,
        preamp: Float = 0f,
        output: Float = 0f
    ) = NexusPlan(
        enabled = true, preampDb = preamp, inputTrimDb = 0f, outputDb = output, eqFreqs = freqs, eqGainsDb = gains,
        compressor = comp, multibandEnabled = multiband, crossLow = 200f, crossHigh = 2500f,
        bands = listOf(PlanBand(comp.copy(enabled = multiband), 1f), PlanBand(comp.copy(enabled = multiband), 0f), PlanBand(comp.copy(enabled = multiband), -1f)),
        gateEnabled = gate, gateThresholdDb = -55f, expanderEnabled = expander, expanderThresholdDb = -45f, expanderRatio = 2f,
        limiterEnabled = limiter, limiterCeilingDb = -0.3f, limiterReleaseMs = 80f, unsupported = emptyList()
    )

    @Test fun eqBandsAreContiguousAndEndAtTheTop() {
        val bands = DynamicsMapper.eqBands(plan())
        assertEquals(freqs.size, bands.size)
        for (i in 1 until bands.size) assertTrue("cutoffs devem crescer", bands[i].cutoffHz > bands[i - 1].cutoffHz)
        assertEquals(20000f, bands.last().cutoffHz, 0.5f)
        // edge between 800 Hz and 1 kHz centres is their geometric mean (≈ 894 Hz)
        assertEquals(894.4f, bands[16].cutoffHz, 1f)
    }

    @Test fun eqGainsAreCarriedAndClamped() {
        val g = FloatArray(freqs.size).also { it[17] = 6f; it[3] = 40f; it[5] = -40f }
        val bands = DynamicsMapper.eqBands(plan(gains = g))
        assertEquals(6f, bands[17].gainDb, 0f)
        assertEquals(DynamicsMapper.MAX_EQ_GAIN_DB, bands[3].gainDb, 0f)
        assertEquals(-DynamicsMapper.MAX_EQ_GAIN_DB, bands[5].gainDb, 0f)
    }

    @Test fun gainStagingKeepsPositiveOutputBeforeTheLimiter() {
        val p = plan(preamp = -6f, output = 4f)
        assertEquals(-2f, DynamicsMapper.inputGainDb(p), 0f)
        assertEquals(0f, DynamicsMapper.limiter(p).postGainDb, 0f)
        assertEquals(-3f, DynamicsMapper.limiter(plan(output = -3f)).postGainDb, 0f)
    }

    @Test fun noMbcStageWhenNothingNeedsIt() {
        assertTrue(DynamicsMapper.mbcBands(plan()).isEmpty())
    }

    @Test fun singleCompressorBecomesOneBand() {
        val c = PlanCompressor(true, -24f, 6f, 5f, 200f, 8f, 3f)
        val b = DynamicsMapper.mbcBands(plan(comp = c)).single()
        assertEquals(-24f, b.thresholdDb, 0f); assertEquals(6f, b.ratio, 0f); assertEquals(3f, b.postGainDb, 0f)
        assertEquals(20000f, b.cutoffHz, 0f)
    }

    @Test fun multibandUsesCrossoversAndBandGain() {
        val c = PlanCompressor(true, -20f, 3f, 20f, 150f, 6f, 0f)
        val bands = DynamicsMapper.mbcBands(plan(comp = c, multiband = true))
        assertEquals(3, bands.size)
        assertEquals(200f, bands[0].cutoffHz, 0f); assertEquals(2500f, bands[1].cutoffHz, 0f); assertEquals(20000f, bands[2].cutoffHz, 0f)
        assertEquals(1f, bands[0].postGainDb, 0f); assertEquals(-1f, bands[2].postGainDb, 0f)
    }

    @Test fun gateAndExpanderUseTheNoiseGateStage() {
        val g = DynamicsMapper.mbcBands(plan(gate = true)).single()
        assertEquals(-55f, g.noiseGateDb, 0f); assertEquals(20f, g.expanderRatio, 0f); assertEquals(1f, g.ratio, 0f)
        val e = DynamicsMapper.mbcBands(plan(expander = true)).single()
        assertEquals(-45f, e.noiseGateDb, 0f); assertEquals(2f, e.expanderRatio, 0f)
    }

    @Test fun transparentPlanIsDetected() {
        assertTrue(DynamicsMapper.isTransparent(plan(limiter = false)))
        assertFalse(DynamicsMapper.isTransparent(plan(limiter = true)))
        assertFalse(DynamicsMapper.isTransparent(plan(gains = FloatArray(freqs.size).also { it[10] = 3f }, limiter = false)))
    }

    @Test fun planJsonFromTheWebUiParses() {
        val f = freqs.joinToString(",")
        val z = freqs.joinToString(",") { "0" }
        val comp = """{"enabled":true,"thresholdDb":-18,"ratio":4,"attackMs":10,"releaseMs":120,"kneeDb":6,"makeupDb":0}"""
        val band = """{"enabled":false,"thresholdDb":-20,"ratio":2,"attackMs":10,"releaseMs":100,"kneeDb":6,"makeupDb":0,"gainDb":0}"""
        val json = """{"version":1,"enabled":true,"preampDb":-3.5,"inputTrimDb":0,"outputDb":0,"eq":{"freqs":[$f],"gainsDb":[$z]},
            "compressor":$comp,"multiband":{"enabled":false,"crossLow":200,"crossHigh":2500,"bands":[$band,$band,$band]},
            "gate":{"enabled":false,"thresholdDb":-55},"expander":{"enabled":false,"thresholdDb":-45,"ratio":2},
            "limiter":{"enabled":true,"thresholdDb":-0.3,"ceilingDb":-0.3,"releaseMs":80},"unsupported":["Stereo Studio"]}"""
        val p = NexusPlan.parse(json)
        assertEquals(-3.5f, p.preampDb, 0f); assertEquals(31, p.eqFreqs.size); assertTrue(p.compressor.enabled); assertEquals(listOf("Stereo Studio"), p.unsupported)
        assertTrue(abs(DynamicsMapper.inputGainDb(p) + 3.5f) < 1e-6)
    }
}
