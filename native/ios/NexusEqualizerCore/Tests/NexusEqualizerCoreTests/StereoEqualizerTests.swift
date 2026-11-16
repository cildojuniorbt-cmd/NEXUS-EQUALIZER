import XCTest
@testable import NexusEqualizerCore

final class StereoEqualizerTests: XCTestCase {
    func testDefaultHasTenBands() {
        XCTAssertEqual(StereoEqualizer().bandCount, 10)
    }

    func testBypassPreservesSamplesAtUnityGain() {
        let eq = StereoEqualizer()
        eq.setBypassed(true)
        var samples: [Float] = [0.25, -0.25, 0.5, -0.5]
        eq.processInterleavedStereo(&samples)
        XCTAssertEqual(samples, [0.25, -0.25, 0.5, -0.5])
    }

    func testOutputGainChangesBothChannels() {
        let eq = StereoEqualizer(frequencies: [])
        eq.setBypassed(true)
        eq.setOutputGainDB(-6)
        var samples: [Float] = [1, -1]
        eq.processInterleavedStereo(&samples)
        XCTAssertEqual(samples[0], Float(pow(10, -6.0 / 20)), accuracy: 0.001)
        XCTAssertEqual(samples[1], -Float(pow(10, -6.0 / 20)), accuracy: 0.001)
    }
}
