import AVFoundation
import AudioToolbox
import NexusEqualizerCore

/// AUv3 stereo effect. Add this file to an Xcode Audio Unit Extension target
/// whose principal factory class is NexusEqualizerAudioUnitFactory.
public final class NexusEqualizerAudioUnit: AUAudioUnit {
    private enum Address {
        static let bypass: AUParameterAddress = 0
        static let outputGain: AUParameterAddress = 1
        static let firstBand: AUParameterAddress = 100
    }

    private let inputBus: AUAudioUnitBus
    private let outputBus: AUAudioUnitBus
    private var processor: RealtimeStereoEqualizer?
    private var selectedFactoryPreset: AUAudioUnitPreset?
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
        inputBus.supportedChannelCounts = [1, 2]
        outputBus.supportedChannelCounts = [1, 2]
        try super.init(componentDescription: componentDescription, options: options)

        inputBusses = AUAudioUnitBusArray(audioUnit: self, busType: .input, busses: [inputBus])
        outputBusses = AUAudioUnitBusArray(audioUnit: self, busType: .output, busses: [outputBus])
        maximumFramesToRender = 4096
        processor = RealtimeStereoEqualizer()
        buildParameterTree()
    }

    public override var factoryPresets: [AUAudioUnitPreset]? {
        [
            AUAudioUnitPreset(number: 0, name: "Flat"),
            AUAudioUnitPreset(number: 1, name: "Bass Boost"),
            AUAudioUnitPreset(number: 2, name: "Vocal"),
            AUAudioUnitPreset(number: 3, name: "Rock"),
            AUAudioUnitPreset(number: 4, name: "Pop")
        ]
    }

    public override var supportsUserPresets: Bool { true }

    public override var currentPreset: AUAudioUnitPreset? {
        get { selectedFactoryPreset }
        set {
            guard let newValue else {
                selectedFactoryPreset = nil
                return
            }

            if newValue.number >= 0 {
                guard let preset = EqualizerPreset(rawValue: newValue.name) else { return }
                applyFactoryPreset(preset)
                selectedFactoryPreset = newValue
            } else {
                do {
                    fullStateForDocument = try presetState(for: newValue)
                    selectedFactoryPreset = newValue
                } catch {
                    selectedFactoryPreset = nil
                }
            }
        }
    }

    private func applyFactoryPreset(_ preset: EqualizerPreset) {
        for (index, gain) in preset.tenBandGainsDB.enumerated() {
            let address = Address.firstBand + AUParameterAddress(index)
            parametersByAddress[address]?.value = AUValue(gain)
        }
    }

    public override func allocateRenderResources() throws {
        try super.allocateRenderResources()
        // Rebuild the active coefficients using the host-negotiated sample rate.
        for (address, parameter) in parametersByAddress {
            applyParameter(address: address, value: parameter.value)
        }
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
            flags: [.flag_IsReadable, .flag_IsWritable, .flag_CanRamp], value: 0
        )
        var children = [bypass, output]
        for band in 0..<RealtimeStereoEqualizer.bandFrequencies.count {
            let frequency = Int(RealtimeStereoEqualizer.bandFrequencies[band])
            let parameter = AUParameterTree.createParameter(
                withIdentifier: "band\(band)", name: "Band \(frequency) Hz",
                address: Address.firstBand + AUParameterAddress(band),
                min: -18, max: 18, unit: .decibels, unitName: nil,
                flags: [.flag_IsReadable, .flag_IsWritable, .flag_CanRamp], value: 0
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
        let sampleRate = inputBus.format.sampleRate
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
            let right: UnsafeMutablePointer<Float>?
            if buffers.count >= 2, let rightRaw = buffers[1].mData {
                right = rightRaw.assumingMemoryBound(to: Float.self)
            } else {
                right = nil
            }

            // AU render events are time ordered. Drain control commands once, then
            // render audio up to each event and apply it on the render thread, then
            // continue from the exact sample offset.
            processor.beginRenderBlock()
            let cycleStart = AUEventSampleTime(timestamp.pointee.mSampleTime)
            var processedFrames = 0
            var event = realtimeEventListHead
            while let current = event {
                let header = current.pointee.head
                let offset64 = max(0, header.eventSampleTime - cycleStart)
                let eventOffset = min(frames, Int(min(offset64, AUEventSampleTime(Int64(frames)))))
                if eventOffset > processedFrames {
                    processor.processPlanarSegment(
                        left: left.advanced(by: processedFrames),
                        right: right?.advanced(by: processedFrames),
                        frameCount: eventOffset - processedFrames
                    )
                    processedFrames = eventOffset
                }

                if eventOffset < frames {
                    let parameterEvent = current.pointee.parameter
                    switch header.eventType {
                    case .parameter:
                        Self.Self.applyScheduledParameter(
                            processor: processor,
                            address: parameterEvent.parameterAddress,
                            value: parameterEvent.value,
                            sampleRate: sampleRate,
                            rampDurationFrames: 0
                        )
                    case .parameterRamp:
                        applyScheduledParameter(
                            processor: processor,
                            address: parameterEvent.parameterAddress,
                            value: parameterEvent.value,
                            rampDurationFrames: parameterEvent.rampDurationSampleFrames
                        )
                    default:
                        break
                    }
                }
                event = header.next
            }

            if processedFrames < frames {
                processor.processPlanarSegment(
                    left: left.advanced(by: processedFrames),
                    right: right?.advanced(by: processedFrames),
                    frameCount: frames - processedFrames
                )
            }
            return noErr
        }
    }


    /// Applies immediate changes or starts sample-by-sample ramps on the render thread.
    private static func applyScheduledParameter(
        processor: RealtimeStereoEqualizer,
        address: AUParameterAddress,
        value: AUValue,
        sampleRate: Double,
        rampDurationFrames: AUAudioFrameCount
    ) {
        switch address {
        case Address.bypass:
            _ = processor.setBypassedAtRenderTime(value >= 0.5)
        case Address.outputGain:
            if rampDurationFrames > 0 {
                _ = processor.rampOutputGainAtRenderTime(
                    targetGainDB: Double(value),
                    durationFrames: rampDurationFrames
                )
            } else {
                _ = processor.setOutputGainAtRenderTime(Double(value))
            }
        case Address.firstBand..<(Address.firstBand + AUParameterAddress(RealtimeStereoEqualizer.bandFrequencies.count)):
            let band = Int(address - Address.firstBand)
            if rampDurationFrames > 0 {
                _ = processor.rampBandAtRenderTime(
                    index: band,
                    targetGainDB: Double(value),
                    sampleRate: sampleRate,
                    durationFrames: rampDurationFrames
                )
            } else {
                _ = processor.setBandAtRenderTime(
                    index: band,
                    gainDB: Double(value),
                    sampleRate: inputBus.format.sampleRate
                )
            }
        default:
            break
        }
    }


    public override var shouldBypassEffect: Bool {
        get { (parametersByAddress[Address.bypass]?.value ?? 0) >= 0.5 }
        set {
            parametersByAddress[Address.bypass]?.value = newValue ? 1 : 0
            _ = processor?.setBypassed(newValue)
        }
    }

}
