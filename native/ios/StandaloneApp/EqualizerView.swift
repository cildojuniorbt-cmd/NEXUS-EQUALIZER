import SwiftUI
import NexusEqualizerCore

/// Native equalizer control surface. Audio routing is supplied by the host/engine;
/// this view does not claim to intercept other iOS apps.
struct EqualizerView: View {
    @State private var selectedPreset: EqualizerPreset = .flat
    @State private var gains = Array(repeating: 0.0, count: 10)
    @State private var outputGain = 0.0
    @State private var isBypassed = false
    @StateObject private var audioIO = AudioIO.shared

    private let frequencies = StereoEqualizer.defaultFrequencies

    var body: some View {
        ZStack {
            Color(red: 0.035, green: 0.055, blue: 0.075).ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    header
                    statusPanel
                    presetPicker
                    graphicEqualizer
                    outputSection
                    platformNotice
                    footer
                }
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 30)
            }
        }
        .preferredColorScheme(.dark)
        .task {
            while !Task.isCancelled {
                audioIO.tick()
                try? await Task.sleep(for: .milliseconds(100))
            }
        }
    }

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text("NEXUS").font(.system(size: 13, weight: .bold, design: .rounded)).tracking(4).foregroundStyle(.cyan)
                Text("EQUALIZER").font(.system(size: 29, weight: .bold, design: .rounded)).foregroundStyle(.white)
            }
            Spacer()
            Image(systemName: "waveform").font(.system(size: 25, weight: .medium)).foregroundStyle(.cyan)
                .frame(width: 54, height: 54)
                .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
        }
    }

    private var statusPanel: some View {
        HStack(spacing: 12) {
            Circle().fill(audioIO.running ? Color.green : Color.orange).frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 3) {
                Text("MODO DE CONTROLE").font(.system(size: 10, weight: .bold)).tracking(1.5).foregroundStyle(.white.opacity(0.5))
                Text(audioIO.status).font(.system(size: 13, weight: .medium)).foregroundStyle(.white).lineLimit(2)
            }
            Spacer()
            Text("iOS").font(.caption.bold()).foregroundStyle(.cyan)
        }
        .padding(15)
        .background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 16))
    }

    private var presetPicker: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("PRESETS", detail: "Escolha uma assinatura sonora")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 9) {
                ForEach(EqualizerPreset.allCases.filter { $0 != .custom }, id: \.self) { preset in
                    Button {
                        selectedPreset = preset
                        gains = preset.tenBandGainsDB
                        for (index, gain) in gains.enumerated() { audioIO.setBandGain(index: index, gainDB: gain) }
                    } label: {
                        Text(preset.rawValue)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(selectedPreset == preset ? Color.black : Color.white.opacity(0.8))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(selectedPreset == preset ? Color.cyan : Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var graphicEqualizer: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                sectionTitle("EQUALIZADOR", detail: "10 bandas paramétricas")
                Spacer()
                Button(isBypassed ? "ATIVAR" : "BYPASS") { isBypassed.toggle(); audioIO.setBypassed(isBypassed) }
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(isBypassed ? .black : .cyan)
                    .padding(.horizontal, 11).padding(.vertical, 8)
                    .background(isBypassed ? Color.cyan : Color.cyan.opacity(0.12), in: Capsule())
            }
            HStack(alignment: .center, spacing: 4) {
                ForEach(0..<10, id: \.self) { index in
                    VStack(spacing: 7) {
                        Text(String(format: "%+.0f", gains[index]))
                            .font(.system(size: 9, weight: .medium, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.7))
                        Slider(value: Binding(
                            get: { gains[index] },
                            set: { value in
                                gains[index] = value
                                selectedPreset = .custom
                                audioIO.setBandGain(index: index, gainDB: value)
                            }
                        ), in: -18...18, step: 0.5)
                        .rotationEffect(.degrees(-90))
                        .frame(width: 105, height: 26)
                        .tint(.cyan)
                        Text(frequencyLabel(frequencies[index]))
                            .font(.system(size: 8, weight: .medium))
                            .foregroundStyle(.white.opacity(0.55))
                            .fixedSize()
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 145)
            .padding(.vertical, 10)
            .padding(.horizontal, 5)
            .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 15))
            Text("Ajustes em dB · Faixa de -18 a +18 dB")
                .font(.system(size: 10)).foregroundStyle(.white.opacity(0.4))
        }
    }

    private var outputSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("SAÍDA", detail: "Nível mestre")
            HStack {
                Image(systemName: "speaker.wave.2.fill").foregroundStyle(.cyan)
                Slider(value: Binding(get: { outputGain }, set: { outputGain = $0; audioIO.setOutputGain(gainDB: $0) }), in: -24...6, step: 0.5).tint(.cyan)
                Text(String(format: "%+.1f dB", outputGain))
                    .font(.system(size: 11, design: .monospaced)).foregroundStyle(.white)
                    .frame(width: 62, alignment: .trailing)
            }
            .padding(15)
            .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 14))
        }
    }

    private var platformNotice: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("IMPORTANTE SOBRE O iOS", systemImage: "info.circle.fill")
                .font(.system(size: 11, weight: .bold)).foregroundStyle(.cyan)
            Text("No iOS 27, selecione NEXUS EQUALIZER no seletor de saída de áudio do iOS. O sistema poderá encaminhar áudio compatível de outros apps para processamento. Alguns apps e modos de vídeo podem interromper a rota.")
                .font(.system(size: 12)).foregroundStyle(.white.opacity(0.65)).fixedSize(horizontal: false, vertical: true)
        }
        .padding(15)
        .background(Color.cyan.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
    }

    private var footer: some View {
        HStack {
            Text("NEXUS WORKS DIGITAL").font(.system(size: 9, weight: .bold)).tracking(2).foregroundStyle(.white.opacity(0.3))
            Spacer()
            Text("iOS 27 SYSTEM AUDIO").font(.system(size: 9, weight: .bold)).tracking(1).foregroundStyle(.cyan.opacity(0.8))
        }
    }

    private func sectionTitle(_ title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.system(size: 12, weight: .bold)).tracking(1.4).foregroundStyle(.white)
            Text(detail).font(.system(size: 11)).foregroundStyle(.white.opacity(0.45))
        }
    }

    private func frequencyLabel(_ frequency: Double) -> String {
        frequency >= 1000 ? String(format: "%.0fk", frequency / 1000) : String(format: "%.0f", frequency)
    }
}
