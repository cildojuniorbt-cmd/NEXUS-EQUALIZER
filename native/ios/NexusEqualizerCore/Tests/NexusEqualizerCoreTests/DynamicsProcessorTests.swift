import XCTest
@testable import NexusEqualizerCore

final class DynamicsProcessorTests: XCTestCase {
    private func dc(_ amp: Float, _ n: Int) -> [Float] { [Float](repeating: amp, count: n) }

    func testStaticCurveBelowThresholdIsUnity() {
        let s = CompressorSettings(enabled: true, thresholdDB: -20, ratio: 4, kneeDB: 0)
        XCTAssertEqual(Compressor.outputLevelDB(-40, s), -40, accuracy: 1e-9)
    }

    func testStaticCurveAboveThresholdFollowsRatio() {
        let s = CompressorSettings(enabled: true, thresholdDB: -20, ratio: 4, kneeDB: 0)
        XCTAssertEqual(Compressor.outputLevelDB(-8, s), -17, accuracy: 1e-9) // 12 dB over -> 3 dB over
    }

    func testSoftKneeIsContinuousAtItsEdges() {
        let s = CompressorSettings(enabled: true, thresholdDB: -20, ratio: 4, kneeDB: 10)
        XCTAssertEqual(Compressor.outputLevelDB(-25, s), -25, accuracy: 1e-9)
        let hard = CompressorSettings(enabled: true, thresholdDB: -20, ratio: 4, kneeDB: 0)
        XCTAssertEqual(Compressor.outputLevelDB(-15, s), Compressor.outputLevelDB(-15, hard), accuracy: 1e-9)
    }

    func testCompressorReducesLoudSignalByTheExpectedAmount() {
        var c = Compressor(settings: CompressorSettings(enabled: true, thresholdDB: -20, ratio: 4, attackMs: 1, releaseMs: 50, kneeDB: 0))
        var l = dc(0.4, 48_000), r = dc(0.4, 48_000)
        c.process(left: &l, right: &r)
        let inDB = 20 * log10(0.4), outDB = 20 * log10(Double(l.last!))
        XCTAssertEqual(outDB - inDB, -(inDB + 20) * 0.75, accuracy: 0.05)
        XCTAssertEqual(l.last!, r.last!)
    }

    func testCompressorLeavesQuietSignalAndDisabledUntouched() {
        var c = Compressor(settings: CompressorSettings(enabled: true, thresholdDB: -20, ratio: 4, kneeDB: 0))
        var l = dc(0.01, 4800), r = dc(0.01, 4800)
        c.process(left: &l, right: &r)
        XCTAssertEqual(l.last!, 0.01, accuracy: 1e-6)
        var off = Compressor(settings: CompressorSettings(enabled: false))
        var l2 = dc(0.9, 100), r2 = dc(0.9, 100)
        off.process(left: &l2, right: &r2)
        XCTAssertEqual(l2.last!, 0.9)
    }

    func testMakeupGainRaisesTheOutput() {
        var c = Compressor(settings: CompressorSettings(enabled: true, thresholdDB: 0, ratio: 1, kneeDB: 0, makeupDB: 6))
        var l = dc(0.1, 1000), r = dc(0.1, 1000)
        c.process(left: &l, right: &r)
        XCTAssertEqual(Double(l.last!), 0.1 * pow(10, 6.0 / 20), accuracy: 1e-4)
    }

    func testLimiterNeverExceedsTheCeiling() {
        var lim = PeakLimiter(enabled: true, ceilingDB: -6, releaseMs: 50)
        let ceiling = Float(pow(10, -6.0 / 20))
        var l = (0..<9600).map { Float(1.8 * sin(2 * Double.pi * 440 * Double($0) / 48_000)) }
        var r = l
        lim.process(left: &l, right: &r)
        XCTAssertLessThanOrEqual(l.map { abs($0) }.max()!, ceiling + 1e-6)
        XCTAssertGreaterThan(l.map { abs($0) }.max()!, ceiling * 0.95)
    }

    func testLimiterPassesQuietSignalUnchanged() {
        var lim = PeakLimiter(enabled: true, ceilingDB: -1)
        var l = dc(0.2, 500), r = dc(0.2, 500)
        lim.process(left: &l, right: &r)
        XCTAssertEqual(l.last!, 0.2, accuracy: 1e-6)
    }
}
