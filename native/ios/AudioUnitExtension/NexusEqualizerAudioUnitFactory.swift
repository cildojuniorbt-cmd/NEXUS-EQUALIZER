import AudioToolbox
import AVFoundation

/// Principal factory class declared by the AUv3 extension's Info.plist.
public final class NexusEqualizerAudioUnitFactory: NSObject, AUAudioUnitFactory {
    public func createAudioUnit(
        with componentDescription: AudioComponentDescription
    ) throws -> AUAudioUnit {
        try NexusEqualizerAudioUnit(
            componentDescription: componentDescription,
            options: []
        )
    }
}
