import Foundation

/// Platform-neutral preset definitions for the NEXUS equalizer.
public enum EqualizerPreset: String, CaseIterable, Sendable {
    case flat = "Flat"
    case bassBoost = "Bass Boost"
    case vocal = "Vocal"
    case rock = "Rock"
    case pop = "Pop"
    case custom = "Custom"

    /// Gains in dB, aligned with StereoEqualizer.defaultFrequencies.
    public var tenBandGainsDB: [Double] {
        switch self {
        case .flat, .custom:
            return Array(repeating: 0, count: 10)
        case .bassBoost:
            return [6, 5, 4, 2, 0, -1, -1, 0, 1, 1]
        case .vocal:
            return [-3, -2, -1, 1, 3, 4, 3, 1, 0, -1]
        case .rock:
            return [4, 3, -1, -3, -1, 2, 4, 5, 5, 4]
        case .pop:
            return [-1, 1, 3, 4, 2, -1, 0, 2, 3, 2]
        }
    }
}

/// Standard 31-band graphic EQ center frequencies, in Hz.
public enum GraphicEqualizer31 {
    public static let frequencies: [Double] = [
        20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160,
        200, 250, 315, 400, 500, 630, 800, 1_000, 1_250, 1_600,
        2_000, 2_500, 3_150, 4_000, 5_000, 6_300, 8_000, 10_000,
        12_500, 16_000, 20_000
    ]
}
