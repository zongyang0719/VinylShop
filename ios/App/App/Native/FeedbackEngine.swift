import AVFoundation
import UIKit

@MainActor
final class FeedbackEngine {
    static let shared = FeedbackEngine()

    private let selectionGenerator = UISelectionFeedbackGenerator()
    private var player: AVAudioPlayer?

    private init() {
        selectionGenerator.prepare()
        if let soundURL = Bundle.main.url(
            forResource: "click-soft",
            withExtension: "mp3"
        ) {
            player = try? AVAudioPlayer(contentsOf: soundURL)
            player?.volume = 0.11
            player?.prepareToPlay()
        }
    }

    func prepare(hapticsEnabled: Bool) {
        if hapticsEnabled {
            selectionGenerator.prepare()
        }
    }

    func selectionChanged(hapticsEnabled: Bool, soundEnabled: Bool) {
        if hapticsEnabled {
            selectionGenerator.selectionChanged()
            selectionGenerator.prepare()
        }
        if soundEnabled {
            player?.currentTime = 0
            player?.play()
        }
    }
}
