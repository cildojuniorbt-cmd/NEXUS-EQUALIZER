// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NexusEqualizerCore",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [.library(name: "NexusEqualizerCore", targets: ["NexusEqualizerCore"])],
    targets: [
        .target(name: "NexusEqualizerRealtime", publicHeadersPath: "include"),
        .target(name: "NexusEqualizerCore", dependencies: ["NexusEqualizerRealtime"]),
        .testTarget(name: "NexusEqualizerCoreTests", dependencies: ["NexusEqualizerCore"])
    ]
)
