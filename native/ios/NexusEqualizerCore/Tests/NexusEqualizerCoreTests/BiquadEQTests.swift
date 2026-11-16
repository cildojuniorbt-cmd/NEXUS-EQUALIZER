import XCTest
@testable import NexusEqualizerCore

final class BiquadEQTests: XCTestCase {
    func testFlatCoefficientsAreFinite() {
        let coefficients = BiquadEQ(frequency: 1000).coefficients()
        XCTAssertEqual(coefficients.count, 5)
        XCTAssertTrue(coefficients.allSatisfy { $0.isFinite })
    }

    func testZeroGainIsUnity() {
        let filter = BiquadEQ(frequency: 1000, gainDB: 0)
        let coefficients = filter.coefficients()
        XCTAssertEqual(coefficients[0], 1, accuracy: 1e-9)
        XCTAssertEqual(coefficients[1], coefficients[3], accuracy: 1e-9)
        XCTAssertEqual(coefficients[2], coefficients[4], accuracy: 1e-9)
    }

    func testProcessingPreservesSilence() {
        let filter = BiquadEQ(frequency: 1000, gainDB: 6)
        var state = BiquadEQ.State()
        let result = filter.process([Float](repeating: 0, count: 128), state: &state)
        XCTAssertTrue(result.allSatisfy { $0 == 0 })
    }
}
