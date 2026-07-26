import AVFoundation
import CoreHaptics
import UIKit

/// Where a crossing event came from. Mirrors `FeedbackSource` in
/// `app/lib/interaction-feedback.ts`: only user-driven and inertial crossings
/// produce output, programmatic ones stay silent.
enum RackFeedbackSource {
    case user
    case inertia
    case programmatic
}

/// Crossing feedback for the rack and the artist wheel.
///
/// Replaces `UISelectionFeedbackGenerator`, which the system throttles and
/// coalesces when records cross quickly, with a Core Haptics transient whose
/// sharpness gives the mechanical detent the web version aims for. Audio runs
/// through `AVAudioEngine` so overlapping clicks mix instead of truncating each
/// other — the direct analogue of the web version creating a fresh
/// `AudioBufferSourceNode` per crossing.
@MainActor
final class RackFeedback {
    static let shared = RackFeedback()

    /// Matches `THROTTLE_MS` in interaction-feedback.ts.
    private static let throttle: TimeInterval = 0.055
    /// Matches `DEFAULT_VOLUME`.
    private static let volume: Float = 0.11

    private var engine: CHHapticEngine?
    private var engineStarted = false
    private let supportsHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics

    private let audioEngine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var clickBuffer: AVAudioPCMBuffer?
    private var audioReady = false

    /// Fallback for hardware without Core Haptics (Simulator, older devices).
    private let selectionGenerator = UISelectionFeedbackGenerator()

    private var lastFire: TimeInterval = 0
    private var activePlayer: CHHapticPatternPlayer?

    private init() {}

    // MARK: - Lifecycle

    /// Call when the rack appears. Cheap to call repeatedly.
    func prepare(hapticsEnabled: Bool, soundEnabled: Bool) {
        if hapticsEnabled {
            if supportsHaptics {
                startHapticEngine()
            } else {
                selectionGenerator.prepare()
            }
        }
        if soundEnabled {
            startAudio()
        }
    }

    /// Call when the rack disappears so the engines stop drawing power.
    func relinquish() {
        engine?.stop()
        engineStarted = false
        if audioEngine.isRunning {
            audioEngine.pause()
        }
    }

    private func startHapticEngine() {
        guard supportsHaptics, !engineStarted else { return }

        if engine == nil {
            engine = try? CHHapticEngine()
            // The system stops the engine on interruption or when the app is
            // backgrounded; both handlers must bring it back or feedback dies
            // silently for the rest of the session.
            engine?.resetHandler = { [weak self] in
                Task { @MainActor in
                    self?.engineStarted = false
                    self?.startHapticEngine()
                }
            }
            engine?.stoppedHandler = { [weak self] _ in
                Task { @MainActor in
                    self?.engineStarted = false
                }
            }
            engine?.playsHapticsOnly = true
        }

        engine?.isAutoShutdownEnabled = false

        do {
            try engine?.start()
            engineStarted = true
        } catch {
            engineStarted = false
            NSLog("[haptics] engine start failed: %@", String(describing: error))
        }
    }

    private func startAudio() {
        if !audioReady {
            // `.ambient` mixes with other audio and honours the silent switch, so
            // a scroll click never interrupts whatever record the user is
            // actually listening to.
            let session = AVAudioSession.sharedInstance()
            try? session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
            try? session.setActive(true)

            guard
                let url = Bundle.main.url(forResource: "click-soft", withExtension: "mp3"),
                let file = try? AVAudioFile(forReading: url)
            else { return }

            let format = file.processingFormat
            guard
                let buffer = AVAudioPCMBuffer(
                    pcmFormat: format,
                    frameCapacity: AVAudioFrameCount(file.length)
                ),
                (try? file.read(into: buffer)) != nil
            else { return }

            clickBuffer = buffer
            audioEngine.attach(player)
            audioEngine.connect(player, to: audioEngine.mainMixerNode, format: format)
            player.volume = Self.volume
            audioReady = true
        }

        guard audioReady else { return }
        if !audioEngine.isRunning {
            try? audioEngine.start()
        }
        if !player.isPlaying {
            player.play()
        }
    }

    // MARK: - Firing

    /// Fires one crossing detent.
    ///
    /// - Parameters:
    ///   - source: `.programmatic` is silently dropped, so jumping the rack from
    ///     the artist wheel does not buzz through every record it passes.
    ///   - speed: Records per second, used to scale intensity. Fast spins feel
    ///     heavier, slow ones lighter.
    func fire(
        source: RackFeedbackSource,
        speed: Double = 0,
        hapticsEnabled: Bool,
        soundEnabled: Bool
    ) {
        guard source != .programmatic else { return }

        let now = CACurrentMediaTime()
        guard now - lastFire >= Self.throttle else { return }
        lastFire = now

        if hapticsEnabled {
            playHaptic(speed: speed)
        }
        if soundEnabled {
            playClick()
        }
    }

    private func playHaptic(speed: Double) {
        if supportsHaptics {
            if !engineStarted {
                startHapticEngine()
            }
            if engineStarted, let engine {
                // A high sharpness transient is what reads as a mechanical click;
                // a rounded low-sharpness pulse reads as a soft tap instead.
                let intensity = Float(min(0.55 + speed * 0.05, 1.0))
                let event = CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(
                            parameterID: .hapticIntensity, value: intensity
                        ),
                        CHHapticEventParameter(
                            parameterID: .hapticSharpness, value: 0.92
                        ),
                    ],
                    relativeTime: 0
                )

                do {
                    let pattern = try CHHapticPattern(events: [event], parameters: [])
                    let player = try engine.makePlayer(with: pattern)
                    try player.start(atTime: CHHapticTimeImmediate)
                    // Hold the player: releasing it as the pattern begins can cut
                    // the event short.
                    activePlayer = player
                    return
                } catch {
                    NSLog("[haptics] play failed: %@", String(describing: error))
                }
            }
        }

        // Reached when the hardware has no haptic engine, when the engine failed
        // to start, or when playback threw. Falling through to UIKit rather than
        // returning means a failure degrades instead of going silent.
        selectionGenerator.selectionChanged()
        selectionGenerator.prepare()
    }

    private func playClick() {
        if !audioReady || !audioEngine.isRunning {
            startAudio()
        }
        guard let clickBuffer, player.isPlaying else { return }
        // Overlapping schedules mix, so a fast spin keeps every detent audible
        // instead of each click cutting off the previous one.
        player.scheduleBuffer(clickBuffer, at: nil, options: [])
    }
}
