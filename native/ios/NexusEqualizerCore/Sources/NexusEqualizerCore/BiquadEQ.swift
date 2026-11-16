import Foundation

/// Portable peaking-EQ biquad. Use from an AVAudioEngine or AUv3 render pipeline.
public struct BiquadEQ: Sendable {
    public var frequency: Double
    public var gainDB: Double
    public var q: Double
    public var sampleRate: Double

    public init(frequency: Double, gainDB: Double = 0, q: Double = 1, sampleRate: Double = 48_000) {
        self.frequency = frequency
        self.gainDB = gainDB
        self.q = q
        self.sampleRate = sampleRate
    }

    /// Returns normalized coefficients [b0, b1, b2, a1, a2].
    public func coefficients() -> [Double] {
        let nyquist = max(1, sampleRate * 0.5)
        let f = min(max(frequency, 10), nyquist * 0.98)
        let safeQ = max(0.1, q)
        let a = pow(10, gainDB / 40)
        let omega = 2 * Double.pi * f / sampleRate
        let alpha = sin(omega) / (2 * safeQ)
        let cosW = cos(omega)
        let a0 = 1 + alpha / a
        let b0 = (1 + alpha * a) / a0
        let b1 = (-2 * cosW) / a0
        let b2 = (1 - alpha * a) / a0
        let a1 = (-2 * cosW) / a0
        let a2 = (1 - alpha / a) / a0
        return [b0, b1, b2, a1, a2]
    }

    public func process(_ input: [Float], state: inout State) -> [Float] {
        let c = coefficients()
        var output = [Float](repeating: 0, count: input.count)
        for i in input.indices {
            let x = Double(input[i])
            let y = c[0] * x + c[1] * state.x1 + c[2] * state.x2
                - c[3] * state.y1 - c[4] * state.y2
            state.x2 = state.x1
            state.x1 = x
            state.y2 = state.y1
            state.y1 = y
            output[i] = Float(y)
        }
        return output
    }

    public struct State: Sendable {
        var x1 = 0.0
        var x2 = 0.0
        var y1 = 0.0
        var y2 = 0.0
        public init() {}
    }
}
