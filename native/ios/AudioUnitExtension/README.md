# NEXUS AUv3 extension target

Add these source files to an Xcode **Audio Unit Extension** target (Effect type), embed the extension in the NEXUS iOS container app, and sign both with the same development team. AUv3 is hosted by compatible audio apps; it does not process arbitrary system audio.

The portable filter implementation is in ../NexusEqualizerCore. The extension target should expose parameters for bypass, master output, and each EQ band, then process the host-provided stereo buffers in its render block. Test discovery in GarageBand-compatible or other AUv3 hosts and verify automation/state restoration before release.

This repository currently contains the shared DSP core and platform contract. A signed iOS app/extension target, provisioning, and App Store submission still require an Apple development environment and account.
