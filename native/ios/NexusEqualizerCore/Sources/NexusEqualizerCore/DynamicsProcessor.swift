import Foundation

/// Compressor settings. Same fields and meaning as the web plan (src/native/plan.ts), so the UI maps 1:1.
public struct CompressorSettings: Sendable, Equatable {
    public var enabled: Bool
    public var thresholdDB: Double
    public var ratio: Double
    public var attackMs: Double
    public var releaseMs: Double
    public var kneeDB: Double
    public var makeupDB: Double

    public init(enabled: Bool = false, thresholdDB: Double = -18, ratio: Double = 4, attackMs: Double = 10,
                releaseMs: Double = 120, kneeDB: Double = 6, makeupDB: Double = 0) {
        self.enabled = enabled; self.thresholdDB = thresholdDB; self.ratio = ratio
        self.attackMs = attackMs; self.releaseMs = releaseMs; self.kneeDB = kneeDB; self.makeupDB = makeupDB
    }
}

/// Stereo-linked feed-forward compressor with a soft knee. Gain smoothing happens in the dB domain.
/// No allocation and no locks in `process`, so it is safe on the audio thread.
public struct Compressor: Sendable {
    public var settings: CompressorSettings
    public let sampleRate: Double
    private var grDB = 0.0 // current gain reduction in dB (<= 0)

    public init(settings: CompressorSettings = CompressorSettings(), sampleRate: Double = 48_000) {
        self.settings = settings
        self.sampleRate = max(1, sampleRate)
    }

    /// Static curve: output level (dB) for an input level (dB), including the soft knee.
    public static func outputLevelDB(_ inputDB: Double, _ s: CompressorSettings) -> Double {
        let ratio = max(1, s.ratio)
        let w = max(0, s.kneeDB)
        let over = inputDB - s.thresholdDB
        if 2 * over < -w { return inputDB }
        if w > 0 && 2 * abs(over) <= w {
            let t = over + w / 2
            return inputDB + (1 / ratio - 1) * t * t / (2 * w)
        }
        return s.thresholdDB + over / ratio
    }

    private func coefficient(ms: Double) -> Double {
        exp(-1.0 / (max(0.01, ms) * 0.001 * sampleRate))
    }

    public var currentGainReductionDB: Double { grDB }

    public mutating func reset() { grDB = 0 }

    public mutating func process(left: inout [Float], right: inout [Float]) {
        let n = min(left.count, right.count)
        guard settings.enabled, n > 0 else { return }
        let attack = coefficient(ms: settings.attackMs)
        let release = coefficient(ms: settings.releaseMs)
        let makeup = pow(10, settings.makeupDB / 20)
        for i in 0..<n {
            let peak = max(abs(Double(left[i])), abs(Double(right[i])))
            let levelDB = peak > 1e-9 ? 20 * log10(peak) : -180
            let targetGR = Compressor.outputLevelDB(levelDB, settings) - levelDB // <= 0
            let coef = targetGR < grDB ? attack : release
            grDB = coef * grDB + (1 - coef) * targetGR
            let gain = pow(10, grDB / 20) * makeup
            left[i] = Float(Double(left[i]) * gain)
            right[i] = Float(Double(right[i]) * gain)
        }
    }
}

/// Peak limiter with instant attack: the output never exceeds the ceiling (no look-ahead, so it can
/// distort on very hot input instead of overshooting; true-peak between samples is not controlled).
public struct PeakLimiter: Sendable {
    public var enabled: Bool
    public var ceilingDB: Double
    public var releaseMs: Double
    public let sampleRate: Double
    private var gain = 1.0

    public init(enabled: Bool = true, ceilingDB: Double = -0.3, releaseMs: Double = 80, sampleRate: Double = 48_000) {
        self.enabled = enabled
        self.ceilingDB = ceilingDB
        self.releaseMs = releaseMs
        self.sampleRate = max(1, sampleRate)
    }

    public mutating func reset() { gain = 1 }

    public mutating func process(left: inout [Float], right: inout [Float]) {
        let n = min(left.count, right.count)
        guard enabled, n > 0 else { return }
        let ceiling = pow(10, min(0, ceilingDB) / 20)
        let release = exp(-1.0 / (max(1, releaseMs) * 0.001 * sampleRate))
        for i in 0..<n {
            let peak = max(abs(Double(left[i])), abs(Double(right[i])))
            let target = peak > ceiling ? ceiling / peak : 1.0
            if target < gain { gain = target } else { gain = release * gain + (1 - release) * target }
            left[i] = Float(Double(left[i]) * gain)
            right[i] = Float(Double(right[i]) * gain)
        }
    }
}
