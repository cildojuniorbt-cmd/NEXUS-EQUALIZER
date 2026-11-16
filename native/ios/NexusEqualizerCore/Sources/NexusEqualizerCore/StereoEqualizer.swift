import Foundation

/// Stereo peaking equalizer core. Retain one instance per audio stream.
/// Configuration and rendering are serialized by a lock in this portable core.
/// A production AUv3 render callback must replace this synchronization with an
/// audio-thread-safe parameter snapshot before shipping.
public final class StereoEqualizer: @unchecked Sendable {
    public static let defaultFrequencies: [Double] = [32, 64, 125, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000]
    private let lock = NSLock()
    private var filters: [BiquadEQ]
    private var coefficients: [BiquadCoefficients]
    private var leftStates: [BiquadEQ.State]
    private var rightStates: [BiquadEQ.State]
    private var bypassed = false
    private var outputGain = 1.0

    public init(sampleRate: Double = 48_000, frequencies: [Double] = StereoEqualizer.defaultFrequencies) {
        filters = frequencies.map { BiquadEQ(frequency: $0, sampleRate: sampleRate) }
        coefficients = filters.map { $0.coefficients() }
        leftStates = filters.map { _ in BiquadEQ.State() }
        rightStates = filters.map { _ in BiquadEQ.State() }
    }

    public var bandCount: Int { lock.lock(); defer { lock.unlock() }; return filters.count }

    public func setBand(index: Int, gainDB: Double, q: Double = 1) {
        lock.lock(); defer { lock.unlock() }
        guard filters.indices.contains(index) else { return }
        filters[index].gainDB = min(18, max(-18, gainDB))
        filters[index].q = min(12, max(0.1, q))
        coefficients[index] = filters[index].coefficients()
    }

    /// Applies a preset to any band layout using logarithmic frequency interpolation.
    public func apply(preset: EqualizerPreset) {
        lock.lock(); defer { lock.unlock() }
        let referenceFrequencies = Self.defaultFrequencies
        let gains = preset.tenBandGainsDB
        for index in filters.indices {
            let frequency = min(max(filters[index].frequency, referenceFrequencies[0]), referenceFrequencies[9])
            let logFrequency = log(frequency)
            var gain = gains[9]
            for lower in 0..<9 {
                let low = log(referenceFrequencies[lower])
                let high = log(referenceFrequencies[lower + 1])
                if logFrequency <= high {
                    let fraction = min(1, max(0, (logFrequency - low) / (high - low)))
                    gain = gains[lower] + (gains[lower + 1] - gains[lower]) * fraction
                    break
                }
            }
            filters[index].gainDB = min(18, max(-18, gain))
            coefficients[index] = filters[index].coefficients()
        }
    }

    public func setBypassed(_ value: Bool) {
        lock.lock(); defer { lock.unlock() }
        bypassed = value
    }

    public func setOutputGainDB(_ gainDB: Double) {
        lock.lock(); defer { lock.unlock() }
        outputGain = pow(10, min(6, max(-24, gainDB)) / 20)
    }

    /// Processes interleaved stereo samples in place. No coefficient arrays are
    /// allocated or recalculated during this block; parameters are cached on change.
    public func processInterleavedStereo(_ samples: inout [Float]) {
        lock.lock(); defer { lock.unlock() }
        guard samples.count >= 2 else { return }
        if bypassed {
            if outputGain != 1 {
                for i in samples.indices { samples[i] = Float(Double(samples[i]) * outputGain) }
            }
            return
        }
        for frame in stride(from: 0, to: samples.count - 1, by: 2) {
            var left = Double(samples[frame])
            var right = Double(samples[frame + 1])
            for band in coefficients.indices {
                left = leftStates[band].process(left, coefficients: coefficients[band])
                right = rightStates[band].process(right, coefficients: coefficients[band])
            }
            samples[frame] = Float(left * outputGain)
            samples[frame + 1] = Float(right * outputGain)
        }
    }
}
