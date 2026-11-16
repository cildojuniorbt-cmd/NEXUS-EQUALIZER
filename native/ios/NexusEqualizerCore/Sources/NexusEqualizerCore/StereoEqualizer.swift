import Foundation

/// Ten-band stereo peaking equalizer core. Retain one instance per audio stream.
public final class StereoEqualizer: @unchecked Sendable {
    public static let defaultFrequencies: [Double] = [32, 64, 125, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000]
    private let lock = NSLock()
    private var filters: [BiquadEQ]
    private var leftStates: [BiquadEQ.State]
    private var rightStates: [BiquadEQ.State]
    private var bypassed = false
    private var outputGain = 1.0

    public init(sampleRate: Double = 48_000, frequencies: [Double] = StereoEqualizer.defaultFrequencies) {
        filters = frequencies.map { BiquadEQ(frequency: $0, sampleRate: sampleRate) }
        leftStates = filters.map { _ in BiquadEQ.State() }
        rightStates = filters.map { _ in BiquadEQ.State() }
    }

    public var bandCount: Int { filters.count }

    public func setBand(index: Int, gainDB: Double, q: Double = 1) {
        lock.lock(); defer { lock.unlock() }
        guard filters.indices.contains(index) else { return }
        filters[index].gainDB = min(18, max(-18, gainDB))
        filters[index].q = min(12, max(0.1, q))
    }

    public func setBypassed(_ value: Bool) {
        lock.lock(); defer { lock.unlock() }
        bypassed = value
    }

    public func setOutputGainDB(_ gainDB: Double) {
        lock.lock(); defer { lock.unlock() }
        outputGain = pow(10, min(6, max(-24, gainDB)) / 20)
    }

    /// Processes interleaved stereo samples in place.
    public func processInterleavedStereo(_ samples: inout [Float]) {
        lock.lock(); defer { lock.unlock() }
        guard samples.count >= 2 else { return }
        if bypassed {
            if outputGain != 1 {
                for i in samples.indices { samples[i] = Float(Double(samples[i]) * outputGain) }
            }
            return
        }
        let coefficients = filters.map { $0.coefficients() }
        for frame in stride(from: 0, to: samples.count - 1, by: 2) {
            var left = Double(samples[frame])
            var right = Double(samples[frame + 1])
            for band in filters.indices {
                left = processSample(left, c: coefficients[band], state: &leftStates[band])
                right = processSample(right, c: coefficients[band], state: &rightStates[band])
            }
            samples[frame] = Float(left * outputGain)
            samples[frame + 1] = Float(right * outputGain)
        }
    }

    private func processSample(_ x: Double, c: [Double], state: inout BiquadEQ.State) -> Double {
        let y = c[0] * x + c[1] * state.x1 + c[2] * state.x2 - c[3] * state.y1 - c[4] * state.y2
        state.x2 = state.x1; state.x1 = x; state.y2 = state.y1; state.y1 = y
        return y
    }
}
