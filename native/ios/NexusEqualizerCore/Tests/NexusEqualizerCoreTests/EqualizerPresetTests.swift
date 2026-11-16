import XCTest
@testable import NexusEqualizerCore

final class EqualizerPresetTests: XCTestCase {
    func testEveryPresetHasTenBandValues() {
        for preset in EqualizerPreset.allCases {
            XCTAssertEqual(preset.tenBandGainsDB.count, 10)
        }
    }

    func testGraphicEqualizerHasThirtyOneAscendingBands() {
        XCTAssertEqual(GraphicEqualizer31.frequencies.count, 31)
        XCTAssertEqual(GraphicEqualizer31.frequencies, GraphicEqualizer31.frequencies.sorted())
    }

    func testFlatPresetIsNeutral() {
        XCTAssertTrue(EqualizerPreset.flat.tenBandGainsDB.allSatisfy { $0 == 0 })
    }
}
