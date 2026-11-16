import AudioToolbox
import AVFoundation
import Foundation

/// Principal factory class declared by the AUv3 extension's Info.plist.
public final class NexusEqualizerAudioUnitFactory: NSObject, AUAudioUnitFactory {
    public func beginRequest(with context: NSExtensionContext) {
        // AUv3 hosts create the audio unit through createAudioUnit(with:).
        // The extension request callback is required by the current SDK protocol.
    }

    public func createAudioUnit(
        with componentDescription: AudioComponentDescription
    ) throws -> AUAudioUnit {
        try NexusEqualizerAudioUnit(
            componentDescription: componentDescription,
            options: []
        )
    }
}
