import Foundation

/// Normalized direct-form biquad coefficients.
public struct BiquadCoefficients: Sendable, RandomAccessCollection {
    public typealias Index = Int
    public var startIndex: Int { 0 }
    public var endIndex: Int { 5 }
    public func index(after i: Int) -> Int { i + 1 }
    public func index(before i: Int) -> Int { i - 1 }
    public subscript(position: Int) -> Double {
        switch position {
        case 0: return b0
        case 1: return b1
        case 2: return b2
        case 3: return a1
        case 4: return a2
        default: preconditionFailure("Coefficient index out of range")
        }
    }
    public let b0: Double
    public let b1: Double
    public let b2: Double
    public let a1: Double
    public let a2: Double

    public init(b0: Double, b1: Double, b2: Double, a1: Double, a2: Double) {
        self.b0 = b0; self.b1 = b1; self.b2 = b2; self.a1 = a1; self.a2 = a2
    }
}

/// Portable peaking-EQ biquad. Coefficients are calculated when parameters change,
/// never inside the per-sample processing loop.
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

    public func coefficients() -> BiquadCoefficients {
        let safeRate = max(1, sampleRate)
        let nyquist = safeRate * 0.5
        let f = min(max(frequency, 10), nyquist * 0.98)
        let safeQ = max(0.1, q)
        let amplitude = pow(10, gainDB / 40)
        let omega = 2 * Double.pi * f / safeRate
        let alpha = sin(omega) / (2 * safeQ)
        let cosW = cos(omega)
        let a0 = 1 + alpha / amplitude
        return BiquadCoefficients(
            b0: (1 + alpha * amplitude) / a0,
            b1: (-2 * cosW) / a0,
            b2: (1 - alpha * amplitude) / a0,
            a1: (-2 * cosW) / a0,
            a2: (1 - alpha / amplitude) / a0
        )
    }

    public func process(_ input: [Float], state: inout State) -> [Float] {
        let c = coefficients()
        var output = [Float](repeating: 0, count: input.count)
        for i in input.indices {
            output[i] = Float(state.process(Double(input[i]), coefficients: c))
        }
        return output
    }

    public struct State: Sendable {
        var x1 = 0.0
        var x2 = 0.0
        var y1 = 0.0
        var y2 = 0.0
        public init() {}

        @inline(__always)
        mutating func process(_ x: Double, coefficients c: BiquadCoefficients) -> Double {
            let y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2
            x2 = x1; x1 = x; y2 = y1; y1 = y
            return y
        }
    }
}
