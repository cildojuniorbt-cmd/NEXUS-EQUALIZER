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
            guard enqueue(filter.coefficients(), band: index) else { return nil }
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
        let c = NexusEQBiquadCoefficients(
            b0: Float(coefficients.b0), b1: Float(coefficients.b1),
            b2: Float(coefficients.b2), a1: Float(coefficients.a1),
            a2: Float(coefficients.a2)
        )
        return nexus_eq_realtime_set_coefficients(handle, band, c)
    }
}
