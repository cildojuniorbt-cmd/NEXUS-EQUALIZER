import Foundation
import NexusEqualizerRealtime

/// Lock-free SPSC bridge for an audio render path.
/// Call configuration methods from one serialized control thread only.
/// Call processInterleavedStereo from one audio thread only.
public final class RealtimeStereoEqualizer {
    public static let bandFrequencies = StereoEqualizer.defaultFrequencies
    private let handle: OpaquePointer

    public init?() {
        guard let created = nexus_eq_realtime_create() else { return nil }
        handle = created
        for (index, frequency) in Self.bandFrequencies.enumerated() {
            let filter = BiquadEQ(frequency: frequency)
            let coefficients = filter.coefficients()
            guard enqueue(coefficients, band: index) else {
                // Swift does not call deinit when a failable initializer exits early.
                nexus_eq_realtime_destroy(created)
                return nil
            }
        }
    }

    deinit {
        nexus_eq_realtime_destroy(handle)
    }

    @discardableResult
    public func setBand(index: Int, gainDB: Double, q: Double = 1, sampleRate: Double = 48_000) -> Bool {
        guard Self.bandFrequencies.indices.contains(index),
              gainDB.isFinite, q.isFinite, sampleRate.isFinite, sampleRate > 0 else { return false }
        let filter = BiquadEQ(
            frequency: Self.bandFrequencies[index],
            gainDB: min(18, max(-18, gainDB)),
            q: min(12, max(0.1, q)),
            sampleRate: sampleRate
        )
        return enqueue(filter.coefficients(), band: index)
    }

    @discardableResult
    public func setBypassed(_ bypassed: Bool) -> Bool {
        nexus_eq_realtime_set_bypass(handle, bypassed)
    }

    @discardableResult
    public func setOutputGainDB(_ gainDB: Double) -> Bool {
        guard gainDB.isFinite else { return false }
        let clamped = min(6, max(-24, gainDB))
        let linear = Float(pow(10, clamped / 20))
        return nexus_eq_realtime_set_output_gain(handle, linear)
    }


    /// Applies an immediate parameter update from the AU render thread.
    /// Must only be called by the same thread that calls processPlanar.
    @discardableResult
    public func setBandAtRenderTime(index: Int, gainDB: Double, sampleRate: Double) -> Bool {
        guard Self.bandFrequencies.indices.contains(index),
              gainDB.isFinite, sampleRate.isFinite, sampleRate > 0 else { return false }
        let filter = BiquadEQ(
            frequency: Self.bandFrequencies[index],
            gainDB: min(18, max(-18, gainDB)),
            sampleRate: sampleRate
        )
        return setRenderCoefficients(filter.coefficients(), band: index)
    }


    /// Starts a sample-by-sample coefficient ramp from the render thread.
    @discardableResult
    public func rampBandAtRenderTime(
        index: Int, targetGainDB: Double, sampleRate: Double, durationFrames: UInt32
    ) -> Bool {
        guard Self.bandFrequencies.indices.contains(index),
              targetGainDB.isFinite, sampleRate.isFinite, sampleRate > 0,
              durationFrames > 0 else { return false }
        let filter = BiquadEQ(
            frequency: Self.bandFrequencies[index],
            gainDB: min(18, max(-18, targetGainDB)),
            sampleRate: sampleRate
        )
        return rampRenderCoefficients(filter.coefficients(), band: index, durationFrames: durationFrames)
    }

    /// Starts a sample-by-sample output gain ramp from the render thread.
    @discardableResult
    public func rampOutputGainAtRenderTime(targetGainDB: Double, durationFrames: UInt32) -> Bool {
        guard targetGainDB.isFinite, durationFrames > 0 else { return false }
        let clamped = min(6, max(-24, targetGainDB))
        let linear = Float(pow(10, clamped / 20))
        return nexus_eq_realtime_render_ramp_output_gain(handle, linear, durationFrames)
    }

    private func rampRenderCoefficients(
        _ coefficients: BiquadCoefficients, band: Int, durationFrames: UInt32
    ) -> Bool {
        guard coefficients.b0.isFinite, coefficients.b1.isFinite,
              coefficients.b2.isFinite, coefficients.a1.isFinite,
              coefficients.a2.isFinite else { return false }
        let c = NexusEQBiquadCoefficients(
            b0: Float(coefficients.b0), b1: Float(coefficients.b1),
            b2: Float(coefficients.b2), a1: Float(coefficients.a1),
            a2: Float(coefficients.a2)
        )
        return nexus_eq_realtime_render_ramp_coefficients(handle, band, c, durationFrames)
    }

    @discardableResult
    public func setBypassedAtRenderTime(_ bypassed: Bool) -> Bool {
        nexus_eq_realtime_render_set_bypass(handle, bypassed)
    }

    @discardableResult
    public func setOutputGainAtRenderTime(_ gainDB: Double) -> Bool {
        guard gainDB.isFinite else { return false }
        let clamped = min(6, max(-24, gainDB))
        let linear = Float(pow(10, clamped / 20))
        return nexus_eq_realtime_render_set_output_gain(handle, linear)
    }

    private func setRenderCoefficients(_ coefficients: BiquadCoefficients, band: Int) -> Bool {
        guard coefficients.b0.isFinite, coefficients.b1.isFinite,
              coefficients.b2.isFinite, coefficients.a1.isFinite,
              coefficients.a2.isFinite else { return false }
        let c = NexusEQBiquadCoefficients(
            b0: Float(coefficients.b0), b1: Float(coefficients.b1),
            b2: Float(coefficients.b2), a1: Float(coefficients.a1),
            a2: Float(coefficients.a2)
        )
        return nexus_eq_realtime_render_set_coefficients(handle, band, c)
    }


    /// Drains serialized control-thread updates once at the start of an AU render block.
    public func beginRenderBlock() {
        nexus_eq_realtime_render_begin_block(handle)
    }

    /// Processes an AU render segment without draining the control queue again.
    /// Use only after beginRenderBlock, on the same render thread.
    public func processPlanarSegment(
        left: UnsafeMutablePointer<Float>,
        right: UnsafeMutablePointer<Float>?,
        frameCount: Int
    ) {
        guard frameCount > 0 else { return }
        nexus_eq_realtime_render_planar_segment(handle, left, right, frameCount)
    }

    /// Processes planar float buffers in place without locks or allocations.
    public func processPlanar(left: UnsafeMutablePointer<Float>, right: UnsafeMutablePointer<Float>?, frameCount: Int) {
        guard frameCount > 0 else { return }
        nexus_eq_realtime_render_planar(handle, left, right, frameCount)
    }

    /// Processes interleaved stereo samples in place without locks or allocations.
    public func processInterleavedStereo(_ samples: inout [Float]) {
        samples.withUnsafeMutableBufferPointer { buffer in
            guard let base = buffer.baseAddress else { return }
            nexus_eq_realtime_render(handle, base, buffer.count)
        }
    }

    private func enqueue(_ coefficients: BiquadCoefficients, band: Int) -> Bool {
        guard coefficients.b0.isFinite, coefficients.b1.isFinite,
              coefficients.b2.isFinite, coefficients.a1.isFinite,
              coefficients.a2.isFinite else { return false }
        let c = NexusEQBiquadCoefficients(
            b0: Float(coefficients.b0), b1: Float(coefficients.b1),
            b2: Float(coefficients.b2), a1: Float(coefficients.a1),
            a2: Float(coefficients.a2)
        )
        return nexus_eq_realtime_set_coefficients(handle, band, c)
    }
}
