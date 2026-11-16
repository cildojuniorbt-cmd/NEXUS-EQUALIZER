import SwiftUI

@main
struct NexusEqualizerApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    var body: some View {
        ZStack {
            Color(red: 0.055, green: 0.075, blue: 0.10).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 18) {
                Text("NEXUS").font(.system(size: 14, weight: .bold, design: .rounded)).tracking(4).foregroundStyle(.cyan)
                Text("EQUALIZER").font(.system(size: 32, weight: .bold, design: .rounded)).foregroundStyle(.white)
                Text("Áudio sob seu controle").font(.title3).foregroundStyle(.white.opacity(0.75))
                Divider().overlay(.white.opacity(0.15))
                Label("Processamento dentro do NEXUS", systemImage: "waveform").foregroundStyle(.white)
                Text("O iOS permite processar áudio dentro deste aplicativo e oferecer plugins AUv3 para aplicativos compatíveis. Ele não permite que um app equalize universalmente o áudio de Spotify, YouTube ou outros aplicativos.")
                    .font(.body).foregroundStyle(.white.opacity(0.7))
                Label("Plugin AUv3", systemImage: "puzzlepiece.extension").foregroundStyle(.cyan)
                Text("Use o NEXUS EQUALIZER como efeito em um host de áudio compatível. A extensão AUv3 será distribuída separadamente do processamento global, que não existe no iOS.")
                    .font(.body).foregroundStyle(.white.opacity(0.7))
                Spacer()
                Text("NEXUS WORKS DIGITAL").font(.caption2).tracking(2).foregroundStyle(.white.opacity(0.35))
            }
            .padding(28)
        }
        .preferredColorScheme(.dark)
    }
}
