import QuartzCore
import SwiftUI
import UIKit

/// Request to jump the rack to a record, raised by the artist wheel.
/// `token` makes repeat jumps to the same index distinct.
struct RackJumpRequest: Equatable {
    var index: Int
    var token: Int
}

// MARK: - One 3D record box

/// A single record sleeve: a `rw × rw × sh` box built from six faces, matching
/// `.cyl-box` and its children in globals.css.
///
/// - top / bottom spine: `rotateX(±90°) translateZ(rw/2)`, `sh` tall
/// - front / back cover:  `translateZ(sh/2)` and `rotateX(180°) translateZ(sh/2)`
/// - left / right edge:   `rotateY(∓90°) translateZ(rw/2)`, `sh` wide
///
/// Every face is single-sided, mirroring `backface-visibility: hidden`.
final class RecordSleeveView: UIView {
    private let coverFront = UIImageView()
    private let coverBack = UIImageView()
    private let spineTop = UIView()
    private let spineBottom = UIView()
    private let edgeLeft = UIView()
    private let edgeRight = UIView()
    private let titleLabel = UILabel()
    private let artistLabel = UILabel()
    private let spineStack = UIStackView()

    private var thickness: CGFloat = 14
    private var albumID: String?
    private var loadTask: Task<Void, Never>?

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        layer.isDoubleSided = true

        for face in [coverFront, coverBack, spineTop, spineBottom, edgeLeft, edgeRight] {
            face.layer.isDoubleSided = false
            addSubview(face)
        }

        for cover in [coverFront, coverBack] {
            cover.contentMode = .scaleAspectFill
            cover.clipsToBounds = true
        }

        // font-size: 10px / weight 680, and 9px / weight 440 at 0.8 opacity.
        titleLabel.font = .systemFont(ofSize: 10, weight: .semibold)
        artistLabel.font = .systemFont(ofSize: 9, weight: .regular)
        artistLabel.alpha = 0.8
        for label in [titleLabel, artistLabel] {
            label.lineBreakMode = .byTruncatingTail
            label.numberOfLines = 1
        }

        spineStack.axis = .horizontal
        spineStack.alignment = .center
        spineStack.spacing = 4
        spineStack.addArrangedSubview(titleLabel)
        spineStack.addArrangedSubview(artistLabel)
        spineBottom.addSubview(spineStack)
        spineBottom.clipsToBounds = true
        spineTop.clipsToBounds = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not used") }

    deinit { loadTask?.cancel() }

    /// Applies the six static face transforms for the current box size.
    func layoutFaces(side: CGFloat, thickness: CGFloat) {
        self.thickness = thickness
        bounds = CGRect(x: 0, y: 0, width: side, height: side)

        let half = side / 2
        let halfThickness = thickness / 2

        coverFront.frame = bounds
        coverFront.layer.transform = CATransform3DMakeTranslation(0, 0, halfThickness)

        coverBack.frame = bounds
        coverBack.layer.transform = CATransform3DTranslate(
            CATransform3DMakeRotation(.pi, 1, 0, 0),
            0,
            0,
            halfThickness
        )

        // Horizontal strip through the middle, rotated out to the top face.
        let spineFrame = CGRect(x: 0, y: half - halfThickness, width: side, height: thickness)
        spineTop.frame = spineFrame
        spineTop.layer.transform = CATransform3DTranslate(
            CATransform3DMakeRotation(.pi / 2, 1, 0, 0),
            0,
            0,
            half
        )

        spineBottom.frame = spineFrame
        spineBottom.layer.transform = CATransform3DTranslate(
            CATransform3DMakeRotation(-.pi / 2, 1, 0, 0),
            0,
            0,
            half
        )
        spineStack.frame = spineBottom.bounds.insetBy(dx: 16, dy: 0)

        // Vertical strip through the middle, rotated out to the side faces.
        let edgeFrame = CGRect(x: half - halfThickness, y: 0, width: thickness, height: side)
        edgeLeft.frame = edgeFrame
        edgeLeft.layer.transform = CATransform3DTranslate(
            CATransform3DMakeRotation(-.pi / 2, 0, 1, 0),
            0,
            0,
            half
        )

        edgeRight.frame = edgeFrame
        edgeRight.layer.transform = CATransform3DTranslate(
            CATransform3DMakeRotation(.pi / 2, 0, 1, 0),
            0,
            0,
            half
        )
    }

    func configure(with album: Album, target: CoverImageStore.Target) {
        guard albumID != album.id else { return }
        albumID = album.id
        loadTask?.cancel()

        titleLabel.text = album.title
        artistLabel.text = album.cleanedArtist

        // Seeded fallback so the box is never bare while artwork decodes,
        // matching `seedColor` in CrateCylinder.tsx.
        apply(edgeColor: Self.seedColor(for: album.title + album.artist))
        coverFront.image = nil
        coverBack.image = nil

        let url = album.coverUrl
        let id = album.id
        loadTask = Task { [weak self] in
            let image = await CoverImageStore.shared.image(for: url, target: target)
            let color = await CoverImageStore.shared.edgeColor(for: url)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self, self.albumID == id else { return }
                self.coverFront.image = image
                self.coverBack.image = image
                if let color {
                    self.apply(edgeColor: color)
                }
            }
        }
    }

    private func apply(edgeColor: UIColor) {
        for face in [spineTop, spineBottom, edgeLeft, edgeRight] {
            face.backgroundColor = edgeColor
        }
        // Covers use the edge colour as their backing so a missing image still
        // reads as a record rather than a hole.
        coverFront.backgroundColor = edgeColor
        coverBack.backgroundColor = edgeColor

        let text = Self.textColor(on: edgeColor)
        titleLabel.textColor = text
        artistLabel.textColor = text
    }

    /// Mirrors `PAL` + `seedColor` in CrateCylinder.tsx.
    private static let palette: [UIColor] = [
        UIColor(red: 0x24 / 255, green: 0x26 / 255, blue: 0x2a / 255, alpha: 1),
        UIColor(red: 0x45 / 255, green: 0x51 / 255, blue: 0x61 / 255, alpha: 1),
        UIColor(red: 0x6f / 255, green: 0x5a / 255, blue: 0x4c / 255, alpha: 1),
        UIColor(red: 0x7f / 255, green: 0x57 / 255, blue: 0x4f / 255, alpha: 1),
        UIColor(red: 0x39 / 255, green: 0x5d / 255, blue: 0x5c / 255, alpha: 1),
        UIColor(red: 0x6d / 255, green: 0x6d / 255, blue: 0x72 / 255, alpha: 1),
    ]

    private static func seedColor(for seed: String) -> UIColor {
        let sum = seed.unicodeScalars.reduce(0) { $0 + Int($1.value) }
        return palette[sum % palette.count]
    }

    /// Mirrors `textOn`: luminance above 148 gets near-black text.
    private static func textColor(on background: UIColor) -> UIColor {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        background.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        let luminance = red * 255 * 0.2126 + green * 255 * 0.7152 + blue * 255 * 0.0722
        return luminance > 148
            ? UIColor(white: 0x11 / 255, alpha: 1)
            : UIColor(white: 0xf7 / 255, alpha: 1)
    }
}

// MARK: - Rack

private final class DisplayLinkProxy {
    weak var target: RecordRackView?
    @objc func step(_ link: CADisplayLink) {
        target?.step(link)
    }
}

/// UIKit port of `CrateCylinder.tsx`.
///
/// The scroll position is a `Double` this view owns; no `UIScrollView` is
/// involved. That is deliberate — the pose of every record is a function of the
/// continuous `scroll` value over a span of ±21 records, which SwiftUI's
/// `scrollTransition` cannot express because its phase is normalised to the
/// items entering and leaving the viewport.
final class RecordRackView: UIView {
    var albums: [Album] = [] {
        didSet {
            guard albums.map(\.id) != oldValue.map(\.id) else { return }
            rebuildWindow(force: true)
        }
    }

    var hapticsEnabled = true
    var soundEnabled = false
    var onActiveIndexChange: ((Int) -> Void)?
    var onInspect: ((Album) -> Void)?

    private var scroll: Double = 0
    private var target: Double = 0
    private var velocity: Double = 0
    private var renderCenter = 0
    private var activeVirtual = 0
    private var activeAlbum = 0

    private var displayLink: CADisplayLink?
    private let proxy = DisplayLinkProxy()
    private var lastTimestamp: CFTimeInterval = 0
    private var running = false

    /// Suppressed on mount and during wheel-driven jumps, matching
    /// `feedbackSuppressedRef`.
    private var feedbackSuppressed = true

    private struct DragState {
        var startY: CGFloat
        var startTarget: Double
        var moved: Bool
        var lastY: CGFloat
        var lastTime: CFTimeInterval
    }
    private var drag: DragState?

    private var slots: [Int: RecordSleeveView] = [:]
    private var pool: [RecordSleeveView] = []
    private let stage = UIView()
    private let vignette = CAGradientLayer()
    private let blurTop = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))
    private let blurBottom = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial))
    private let blurTopMask = CAGradientLayer()
    private let blurBottomMask = CAGradientLayer()

    private var sleeveSide: CGFloat = 0
    private var reduceMotion = UIAccessibility.isReduceMotionEnabled

    /// `.crate-scene-side` background: #99938b.
    private static let sceneColor = UIColor(
        red: 0x99 / 255,
        green: 0x93 / 255,
        blue: 0x8b / 255,
        alpha: 1
    )

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = Self.sceneColor
        clipsToBounds = true

        addSubview(stage)
        // CSS `perspective: 3200px` with `perspective-origin: 50% 47%`. The
        // anchor point is what a sublayerTransform is applied about, so moving it
        // to 0.47 reproduces the raised vanishing point.
        stage.layer.sublayerTransform = RackTuning.perspectiveTransform
        stage.layer.anchorPoint = CGPoint(x: 0.5, y: 0.47)

        // `.crate-scene-side::after` radial vignette. A CAGradientLayer radial
        // gradient is the closest native equivalent of the CSS ellipse.
        vignette.type = .radial
        vignette.colors = [
            UIColor.clear.cgColor,
            UIColor(red: 55 / 255, green: 51 / 255, blue: 48 / 255, alpha: 0.06).cgColor,
            UIColor(red: 35 / 255, green: 32 / 255, blue: 30 / 255, alpha: 0.22).cgColor,
        ]
        vignette.locations = [0.38, 0.72, 1.18]
        vignette.startPoint = CGPoint(x: 0.5, y: 0.43)
        vignette.endPoint = CGPoint(x: 1.25, y: 1.18)
        layer.addSublayer(vignette)

        // `.crate-depth-blur--top/bottom`: blurred veils masked by a linear
        // gradient so the blur fades toward the middle of the scene.
        for (view, mask) in [(blurTop, blurTopMask), (blurBottom, blurBottomMask)] {
            view.isUserInteractionEnabled = false
            addSubview(view)
            mask.colors = [UIColor.black.cgColor, UIColor.clear.cgColor]
            view.layer.mask = mask
        }
        blurTop.contentView.backgroundColor = Self.sceneColor.withAlphaComponent(0.04)
        blurBottom.contentView.backgroundColor = Self.sceneColor.withAlphaComponent(0.05)
        blurTopMask.startPoint = CGPoint(x: 0.5, y: 0)
        blurTopMask.endPoint = CGPoint(x: 0.5, y: 1)
        blurBottomMask.startPoint = CGPoint(x: 0.5, y: 1)
        blurBottomMask.endPoint = CGPoint(x: 0.5, y: 0)

        proxy.target = self

        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan))
        addGestureRecognizer(pan)
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        addGestureRecognizer(tap)

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(reduceMotionChanged),
            name: UIAccessibility.reduceMotionStatusDidChangeNotification,
            object: nil
        )
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not used") }

    deinit {
        displayLink?.invalidate()
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func reduceMotionChanged() {
        reduceMotion = UIAccessibility.isReduceMotionEnabled
    }

    // MARK: Layout

    override func layoutSubviews() {
        super.layoutSubviews()

        stage.frame = bounds
        stage.layer.anchorPoint = CGPoint(x: 0.5, y: 0.47)
        stage.layer.position = CGPoint(x: bounds.midX, y: bounds.height * 0.47)
        vignette.frame = bounds

        let topHeight = bounds.height * 0.21
        let bottomHeight = bounds.height * 0.23
        blurTop.frame = CGRect(x: 0, y: 0, width: bounds.width, height: topHeight)
        blurBottom.frame = CGRect(
            x: 0,
            y: bounds.height - bottomHeight,
            width: bounds.width,
            height: bottomHeight
        )
        blurTopMask.frame = blurTop.bounds
        blurBottomMask.frame = blurBottom.bounds

        // `--rw: min(78vw, 380px)`, `--sh: 14px`.
        let side = min(bounds.width * 0.78, 380)
        if side != sleeveSide {
            sleeveSide = side
            for sleeve in slots.values {
                sleeve.layoutFaces(side: side, thickness: 14)
            }
            for sleeve in pool {
                sleeve.layoutFaces(side: side, thickness: 14)
            }
        }
        positionSlots()
        applyTransforms()
    }

    // MARK: Window

    func setInitialIndex(_ index: Int) {
        let normalized = wrapRecordIndex(index, max(albums.count, 1))
        scroll = Double(normalized)
        target = scroll
        renderCenter = normalized
        activeVirtual = normalized
        activeAlbum = normalized
        feedbackSuppressed = true
        rebuildWindow(force: true)
    }

    /// Mirrors the `visibleRecords` window: `RANGE * 2 + 1` records centred on
    /// `renderCenter`, wrapped so the rack loops forever.
    private func rebuildWindow(force: Bool = false) {
        guard !albums.isEmpty, sleeveSide > 0 || force else { return }
        let count = albums.count
        let wanted = Set(
            (-RackTuning.range...RackTuning.range).map { renderCenter + $0 }
        )

        for (virtualIndex, sleeve) in slots where !wanted.contains(virtualIndex) {
            sleeve.removeFromSuperview()
            slots.removeValue(forKey: virtualIndex)
            pool.append(sleeve)
        }

        for virtualIndex in wanted.sorted() {
            let album = albums[wrapRecordIndex(virtualIndex, count)]
            let sleeve: RecordSleeveView
            if let existing = slots[virtualIndex] {
                sleeve = existing
            } else {
                sleeve = pool.popLast() ?? RecordSleeveView(frame: .zero)
                if sleeveSide > 0 {
                    sleeve.layoutFaces(side: sleeveSide, thickness: 14)
                }
                stage.addSubview(sleeve)
                slots[virtualIndex] = sleeve
            }
            sleeve.configure(with: album, target: .sleeve)
        }

        positionSlots()
        sortByDepth()
        applyTransforms()
    }

    private func positionSlots() {
        guard sleeveSide > 0 else { return }
        let centre = CGPoint(x: stage.bounds.midX, y: stage.bounds.midY)
        for sleeve in slots.values {
            sleeve.center = centre
        }
    }

    /// The web sorts the rendered records by descending distance so nearer ones
    /// paint last. Core Animation paints siblings in order and does no depth
    /// testing, so the same ordering has to be applied here. `zPosition` is not
    /// usable for this: it also translates in Z, which would change the record's
    /// apparent size under perspective.
    private func sortByDepth() {
        let ordered = slots
            .sorted { abs($0.key - renderCenter) > abs($1.key - renderCenter) }
            .map(\.value)
        for sleeve in ordered {
            stage.bringSubviewToFront(sleeve)
        }
    }

    private func applyTransforms() {
        for (virtualIndex, sleeve) in slots {
            sleeve.layer.transform = recordRackTransform(
                index: Double(virtualIndex),
                scroll: scroll
            )
        }
    }

    // MARK: Animation loop

    private func startLoop() {
        guard !running else { return }
        running = true
        lastTimestamp = 0
        let link = CADisplayLink(target: proxy, selector: #selector(DisplayLinkProxy.step))
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    private func stopLoop() {
        running = false
        displayLink?.invalidate()
        displayLink = nil
        lastTimestamp = 0
    }

    fileprivate func step(_ link: CADisplayLink) {
        if lastTimestamp == 0 {
            lastTimestamp = link.timestamp
        }
        let delta = min(link.timestamp - lastTimestamp, 0.05)
        lastTimestamp = link.timestamp

        let dragging = drag != nil
        let tau = dragging
            ? RackTuning.tauDragging
            : reduceMotion ? RackTuning.tauReducedMotion : RackTuning.tauReleased

        let diff = target - scroll
        if abs(diff) > 0.0002 {
            scroll += diff * (1 - exp(-delta / tau))
        } else {
            scroll = target
        }

        commit(scroll)
        applyTransforms()

        if !dragging, abs(target - scroll) <= 0.0002 {
            stopLoop()
        }
    }

    /// Detects a crossing and fires feedback, matching `commit` in the web version.
    private func commit(_ value: Double) {
        guard !albums.isEmpty else { return }
        let virtualIndex = Int(value.rounded())
        let albumIndex = wrapRecordIndex(virtualIndex, albums.count)

        if virtualIndex != activeVirtual {
            let wasSuppressed = feedbackSuppressed
            activeVirtual = virtualIndex
            renderCenter = virtualIndex
            rebuildWindow()
            if !wasSuppressed {
                RackFeedback.shared.fire(
                    source: .user,
                    speed: abs(velocity),
                    hapticsEnabled: hapticsEnabled,
                    soundEnabled: soundEnabled
                )
            }
        }
        if albumIndex != activeAlbum {
            activeAlbum = albumIndex
            onActiveIndexChange?(albumIndex)
        }
    }

    // MARK: Input

    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        let location = gesture.location(in: self)

        switch gesture.state {
        case .began:
            feedbackSuppressed = false
            RackFeedback.shared.prepare(
                hapticsEnabled: hapticsEnabled,
                soundEnabled: soundEnabled
            )
            drag = DragState(
                startY: location.y,
                startTarget: target,
                moved: false,
                lastY: location.y,
                lastTime: CACurrentMediaTime()
            )
            velocity = 0
            startLoop()

        case .changed:
            guard var state = drag else { return }
            // Dragging up advances the rack, matching `d.y0 - e.clientY`.
            let distance = Double(state.startY - location.y)
            if abs(distance) > RackTuning.dragSlop {
                state.moved = true
            }

            let now = CACurrentMediaTime()
            let elapsed = now - state.lastTime
            if elapsed > 0.008 {
                velocity = Double(state.lastY - location.y) / (elapsed * RackTuning.pxPerItem)
                state.lastY = location.y
                state.lastTime = now
            }
            drag = state
            target = state.startTarget + distance / RackTuning.pxPerItem
            startLoop()

        case .ended, .cancelled, .failed:
            let current = velocity
            if abs(current) > 0.5 {
                let predicted = target + current / RackTuning.decayRate
                let rounded = predicted.rounded()
                let currentRound = scroll.rounded()
                target = min(
                    max(rounded, currentRound - RackTuning.maxFlingExtra),
                    currentRound + RackTuning.maxFlingExtra
                )
            } else {
                target = target.rounded()
            }
            velocity = 0
            drag = nil
            startLoop()

        default:
            break
        }
    }

    @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
        guard !albums.isEmpty else { return }
        let point = gesture.location(in: stage)

        // Records are laid out linearly in Y, 50pt apart, under a very shallow
        // 3200pt perspective, so the tap maps back to a record by position.
        // (The web relies on DOM hit testing, which is not usable here: the
        // centred record is edge-on at rotateX(90°) and degenerates.)
        let offset = Double(point.y - stage.bounds.midY)
            / RecordRackGeometry.standard.itemSpacingPx
        let virtualIndex = Int((scroll + offset).rounded())

        feedbackSuppressed = false
        if virtualIndex == activeVirtual {
            onInspect?(albums[wrapRecordIndex(virtualIndex, albums.count)])
        } else {
            target = Double(virtualIndex)
            velocity = 0
            startLoop()
        }
    }

    /// Jump driven by the artist wheel. Feedback stays suppressed so the rack
    /// does not buzz through every record it passes.
    func jump(to index: Int) {
        guard !albums.isEmpty else { return }
        feedbackSuppressed = true
        let normalized = wrapRecordIndex(index, albums.count)
        activeAlbum = normalized
        target = Double(
            nearestRecordOccurrence(normalized, Int(target.rounded()), albums.count)
        )
        velocity = 0
        startLoop()
    }
}

// MARK: - SwiftUI bridge

struct RecordRackScene: UIViewRepresentable {
    let albums: [Album]
    let hapticsEnabled: Bool
    let soundEnabled: Bool
    var jumpRequest: RackJumpRequest?
    let onActiveIndexChange: (Int) -> Void
    let onInspect: (Album) -> Void

    func makeUIView(context: Context) -> RecordRackView {
        let view = RecordRackView(frame: .zero)
        view.albums = albums
        view.hapticsEnabled = hapticsEnabled
        view.soundEnabled = soundEnabled
        view.onActiveIndexChange = onActiveIndexChange
        view.onInspect = onInspect
        view.setInitialIndex(0)
        RackFeedback.shared.prepare(
            hapticsEnabled: hapticsEnabled,
            soundEnabled: soundEnabled
        )
        return view
    }

    func updateUIView(_ view: RecordRackView, context: Context) {
        view.albums = albums
        view.hapticsEnabled = hapticsEnabled
        view.soundEnabled = soundEnabled
        view.onActiveIndexChange = onActiveIndexChange
        view.onInspect = onInspect

        if let jumpRequest, jumpRequest != context.coordinator.lastJump {
            context.coordinator.lastJump = jumpRequest
            view.jump(to: jumpRequest.index)
        }
    }

    static func dismantleUIView(_ view: RecordRackView, coordinator: Coordinator) {
        RackFeedback.shared.relinquish()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    final class Coordinator {
        var lastJump: RackJumpRequest?
    }
}
