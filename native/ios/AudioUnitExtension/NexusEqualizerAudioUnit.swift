import AVFoundation
import AudioToolbox
import NexusEqualizerCore

/// AUv3 stereo effect. Add this file to an Xcode Audio Unit Extension target
/// whose principal class is NexusEqualizerAudioUnit.
public final class NexusEqualizerAudioUnit: AUAudioUnit {
    private enum Address {
        static let bypass: AUParameterAddress = 0
        static let outputGain: AUParameterAddress = 1
        static let firstBand: AUParameterAddress = 100
    }

    private let inputBus: AUAudioUnitBus
    private let outputBus: AUAudioUnitBus
    private var processor: RealtimeStereoEqualizer?
    private var parametersByAddress: [AUParameterAddress: AUParameter] = [:]

    public override init(
        componentDescription: AudioComponentDescription,
        options: AudioComponentInstantiationOptions = []
    ) throws {
        let format = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: 48_000,
            channels: 2,
            interleaved: false
        )!
        inputBus = try AUAudioUnitBus(format: format)
        outputBus = try AUAudioUnitBus(format: format)
        try super.init(componentDescription: componentDescription, options: options)

        inputBusses = AUAudioUnitBusArray(audioUnit: self, busType: .input, busses: [inputBus])
        outputBusses = AUAudioUnitBusArray(audioUnit: self, busType: .output, busses: [outputBus])
        maximumFramesToRender = 4096
        processor = RealtimeStereoEqualizer()
        buildParameterTree()
    }

    private func buildParameterTree() {
        let bypass = AUParameterTree.createParameter(
            withIdentifier: "bypass", name: "Bypass", address: Address.bypass,
            min: 0, max: 1, unit: .boolean, unitName: nil,
            flags: [.flag_IsReadable, .flag_IsWritable], value: 0
        )
        let output = AUParameterTree.createParameter(
            withIdentifier: "outputGain", name: "Output Gain", address: Address.outputGain,
            min: -24, max: 6, unit: .decibels, unitName: nil,
            flags: [.flag_IsReadable, .flag_IsWritable], value: 0
        )
        var children = [bypass, output]
        for band in 0..<RealtimeStereoEqualizer.bandFrequencies.count {
            let frequency = Int(RealtimeStereoEqualizer.bandFrequencies[band])
            let parameter = AUParameterTree.createParameter(
                withIdentifier: "band\(band)", name: "Band \(frequency) Hz",
                address: Address.firstBand + AUParameterAddress(band),
                min: -18, max: 18, unit: .decibels, unitName: nil,
                flags: [.flag_IsReadable, .flag_IsWritable], value: 0
            )
            children.append(parameter)
        }

        let tree = AUParameterTree.createTree(withChildren: children)
        for parameter in children {
            parametersByAddress[parameter.address] = parameter
        }
        tree.implementorValueObserver = { [weak self] parameter, value in
            self?.applyParameter(address: parameter.address, value: value)
        }
        tree.implementorValueProvider = { [weak self] parameter in
            self?.parametersByAddress[parameter.address]?.value ?? parameter.value
        }
        parameterTree = tree
    }

    private func applyParameter(address: AUParameterAddress, value: AUValue) {
        guard let processor else { return }
        switch address {
        case Address.bypass:
            _ = processor.setBypassed(value >= 0.5)
        case Address.outputGain:
            _ = processor.setOutputGainDB(Double(value))
        case Address.firstBand..<(Address.firstBand + AUParameterAddress(RealtimeStereoEqualizer.bandFrequencies.count)):
            let band = Int(address - Address.firstBand)
            _ = processor.setBand(
                index: band,
                gainDB: Double(value),
                sampleRate: inputBus.format.sampleRate
            )
        default:
            break
        }
    }

    public override var internalRenderBlock: AUInternalRenderBlock {
        // Capture the DSP object directly. The render closure never locks,
        // allocates scratch buffers, or reaches back into the AUAudioUnit object.
        guard let processor else {
            return { _, _, _, _, _, _, _ in kAudioUnitErr_Uninitialized }
        }
        return { actionFlags, timestamp, frameCount, outputBusNumber, outputData, realtimeEventListHead, pullInputBlock in
            guard outputBusNumber == 0, let outputData, let pullInputBlock else {
                return kAudioUnitErr_InvalidParameter
            }
            let pullStatus = pullInputBlock(
                actionFlags, timestamp, frameCount, 0, outputData
            )
            guard pullStatus == noErr else { return pullStatus }

            var buffers = UnsafeMutableAudioBufferListPointer(outputData)
            guard buffers.count > 0 else { return kAudioUnitErr_InvalidPropertyValue }
            let frames = Int(frameCount)
            guard let leftRaw = buffers[0].mData else { return kAudioUnitErr_InvalidPropertyValue }
            let left = leftRaw.assumingMemoryBound(to: Float.self)

            if buffers.count >= 2, let rightRaw = buffers[1].mData {
                let right = rightRaw.assumingMemoryBound(to: Float.self)
                processor.processPlanar(left: left, right: right, frameCount: frames)
            } else {
                processor.processPlanar(left: left, right: nil, frameCount: frames)
            }
            return noErr
        }
    }

    public override var shouldBypassEffect: Bool {
        get { parametersByAddress[Address.bypass]?.value ?? 0 >= 0.5 }
        set {
            parametersByAddress[Address.bypass]?.value = newValue ? 1 : 0
            _ = processor?.setBypassed(newValue)
        }
    }

    public override var fullState: [String: Any]? {
        get { super.fullState }
        set { super.fullState = newValue }
    }
}
