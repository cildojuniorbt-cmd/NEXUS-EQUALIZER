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

    func testThirtyOneBandLayoutAcceptsPresets() {
        let eq = StereoEqualizer(frequencies: GraphicEqualizer31.frequencies)
        XCTAssertEqual(eq.bandCount, 31)
        eq.apply(preset: .rock)
        var samples = [Float](repeating: 0.1, count: 512)
        eq.processInterleavedStereo(&samples)
        XCTAssertTrue(samples.allSatisfy { $0.isFinite })
    }

    func testChangingBandDoesNotProduceNonFiniteOutput() {
        let eq = StereoEqualizer()
        eq.setBand(index: 4, gainDB: 18, q: 12)
        var samples = [Float](repeating: 0.25, count: 256)
        eq.processInterleavedStereo(&samples)
        XCTAssertTrue(samples.allSatisfy { $0.isFinite })
    }
    func testLeftAndRightChannelsRemainIndependent() {
        let eq = StereoEqualizer(frequencies: [])
        eq.setBypassed(true)
        var samples: [Float] = [1, 0]
        eq.processInterleavedStereo(&samples)
        XCTAssertEqual(samples[0], 1, accuracy: 0.0001)
        XCTAssertEqual(samples[1], 0, accuracy: 0.0001)
    }

    func testOutputGainIsClampedToDocumentedMaximum() {
        let eq = StereoEqualizer(frequencies: [])
        eq.setBypassed(true)
        eq.setOutputGainDB(24)
        var samples: [Float] = [1, 1]
        eq.processInterleavedStereo(&samples)
        XCTAssertEqual(samples[0], Float(pow(10, 6.0 / 20)), accuracy: 0.001)
        XCTAssertEqual(samples[1], Float(pow(10, 6.0 / 20)), accuracy: 0.001)
    }

    func testOddSampleCountDoesNotCrashOrReadPastEnd() {
        let eq = StereoEqualizer(frequencies: [])
        var samples: [Float] = [0.1, -0.1, 0.2]
        eq.processInterleavedStereo(&samples)
        XCTAssertEqual(samples.count, 3)
        XCTAssertTrue(samples.allSatisfy { $0.isFinite })
    }


    func testRealtimeEngineProcessesStereoWithoutChangingChannelRouting() throws {
        let engine = try XCTUnwrap(RealtimeStereoEqualizer())
        var samples: [Float] = [0.25, -0.25, 0.5, -0.5]
        engine.processInterleavedStereo(&samples)
        XCTAssertEqual(samples[0], 0.25, accuracy: 0.0001)
        XCTAssertEqual(samples[1], -0.25, accuracy: 0.0001)
        XCTAssertEqual(samples[2], 0.5, accuracy: 0.0001)
        XCTAssertEqual(samples[3], -0.5, accuracy: 0.0001)
    }

    func testRealtimeEngineBypassAndOutputGain() throws {
        let engine = try XCTUnwrap(RealtimeStereoEqualizer())
        XCTAssertTrue(engine.setOutputGainDB(6))
        XCTAssertTrue(engine.setBypassed(true))
        var samples: [Float] = [0.1, -0.1]
        engine.processInterleavedStereo(&samples)
        XCTAssertGreaterThan(samples[0], 0.1)
        XCTAssertLessThan(samples[1], -0.1)
    }

    func testRealtimeEngineRejectsInvalidBand() throws {
        let engine = try XCTUnwrap(RealtimeStereoEqualizer())
        XCTAssertFalse(engine.setBand(index: 10, gainDB: 3))
    }


    func testRealtimePlanarRenderKeepsStereoChannelsIndependent() throws {
        let engine = try XCTUnwrap(RealtimeStereoEqualizer())
        var left: [Float] = [0.2, 0.4, -0.2]
        var right: [Float] = [-0.1, -0.3, 0.1]
        left.withUnsafeMutableBufferPointer { l in
            right.withUnsafeMutableBufferPointer { r in
                engine.processPlanar(left: l.baseAddress!, right: r.baseAddress!, frameCount: l.count)
            }
        }
        XCTAssertEqual(left[0], 0.2, accuracy: 0.0001)
        XCTAssertEqual(left[1], 0.4, accuracy: 0.0001)
        XCTAssertEqual(right[0], -0.1, accuracy: 0.0001)
        XCTAssertEqual(right[1], -0.3, accuracy: 0.0001)
    }

    func testRealtimePlanarMonoRender() throws {
        let engine = try XCTUnwrap(RealtimeStereoEqualizer())
        var mono: [Float] = [0.25, -0.25, 0.5]
        mono.withUnsafeMutableBufferPointer { buffer in
            engine.processPlanar(left: buffer.baseAddress!, right: nil, frameCount: buffer.count)
        }
        XCTAssertEqual(mono[0], 0.25, accuracy: 0.0001)
        XCTAssertEqual(mono[2], 0.5, accuracy: 0.0001)
    }


    func testRealtimeEngineAppliesBandGainToSignal() throws {
        let engine = try XCTUnwrap(RealtimeStereoEqualizer())
        XCTAssertTrue(engine.setBand(index: 0, gainDB: 12, q: 1, sampleRate: 48_000))
        let frameCount = 8192
        var samples = [Float](repeating: 0, count: frameCount * 2)
        for frame in 0..<frameCount {
            let value = Float(sin(2 * Double.pi * 32 * Double(frame) / 48_000))
            samples[frame * 2] = value
            samples[frame * 2 + 1] = value
        }
        engine.processInterleavedStereo(&samples)
        let outputRMS = sqrt(samples.reduce(0.0) { $0 + Double($1 * $1) } / Double(samples.count))
        XCTAssertGreaterThan(outputRMS, 0.5)
    }

    func testRealtimeCommandQueueReportsBackpressure() throws {
        let engine = try XCTUnwrap(RealtimeStereoEqualizer())
        var accepted = 0
        var rejected = 0
        for index in 0..<300 {
            if engine.setBand(index: index % 10, gainDB: Double(index % 18)) {
                accepted += 1
            } else {
                rejected += 1
            }
        }
        XCTAssertGreaterThan(accepted, 0)
        XCTAssertGreaterThan(rejected, 0)
        var samples: [Float] = [0.1, -0.1]
        engine.processInterleavedStereo(&samples)
        XCTAssertTrue(engine.setBand(index: 0, gainDB: 0))
    }

}
