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
/// The faces are **not** subviews of a per-record container. Core Animation has
/// no equivalent of `transform-style: preserve-3d`: a layer flattens its subtree
/// into its own plane, so a face perpendicular to that plane — every spine and
/// edge — collapses to zero height and never draws. The covers survived only
/// because a pure Z translation keeps them coplanar with the container.
///
/// So the hierarchy is flattened instead: every face is a direct child of the
/// rack's stage, which is the layer carrying the perspective, and each face's
/// transform is pre-multiplied as `localTransform · sleeveTransform`. That is the
/// Core Animation equivalent of `preserve-3d`, and it puts every face in the same
/// 3D space the perspective divide applies to.
final class RecordSleeve {
    private let coverFront = UIImageView()
    private let coverBack = UIImageView()
    private let spineTop = UIView()
    private let spineBottom = UIView()
    private let spineTopHighlight = UIView()
    private let spineBottomHighlight = UIView()
    private let edgeLeft = UIView()
    private let edgeRight = UIView()
    private let spineTopLabel = UILabel()
    private let spineBottomLabel = UILabel()

    /// Painted back to front within one record: covers, then the printed spine,
    /// then the side edges.
    private(set) lazy var faces: [UIView] = [
        coverBack, coverFront, edgeLeft, edgeRight, spineTop, spineBottom,
    ]

    private var localTransforms: [ObjectIdentifier: CATransform3D] = [:]
    private var albumID: String?
    private var loadTask: Task<Void, Never>?

    init() {
        for cover in [coverFront, coverBack] {
            cover.contentMode = .scaleAspectFill
            cover.clipsToBounds = true
            // `.cyl-cover { box-shadow: 0 0 0 1px var(--record-edge) }` — the ring
            // that reads as the sleeve's cut edge.
            cover.layer.borderWidth = 1
        }
        for edge in [edgeLeft, edgeRight] {
            edge.layer.borderWidth = 1
        }

        // `.cyl-spine { box-shadow: 0 1px 4px rgba(0,0,0,.22),
        //               inset 0 .5px 0 rgba(255,255,255,.18) }`
        // The drop shadow lifts the spine off the cover behind it and the inset
        // highlight catches light on the top lip; together they are what make the
        // record read as a solid box rather than a flat sheet.
        for spine in [spineTop, spineBottom] {
            spine.layer.shadowColor = UIColor.black.cgColor
            spine.layer.shadowOpacity = 0.22
            spine.layer.shadowRadius = 2
            spine.layer.shadowOffset = CGSize(width: 0, height: 1)
        }
        for highlight in [spineTopHighlight, spineBottomHighlight] {
            highlight.backgroundColor = UIColor(white: 1, alpha: 0.18)
        }
        spineTop.addSubview(spineTopHighlight)
        spineBottom.addSubview(spineBottomHighlight)

        // The web renders `<strong>title</strong><span>artist</span>` in a centred
        // flex row. One attributed line is the deterministic equivalent.
        for label in [spineTopLabel, spineBottomLabel] {
            label.textAlignment = .center
            label.numberOfLines = 1
            label.lineBreakMode = .byTruncatingTail
        }
        spineTop.addSubview(spineTopLabel)
        spineBottom.addSubview(spineBottomLabel)

        for face in faces {
            face.isUserInteractionEnabled = false
        }
    }

    deinit { loadTask?.cancel() }

    func addFaces(to stage: UIView) {
        for face in faces {
            stage.addSubview(face)
        }
    }

    func removeFaces() {
        for face in faces {
            face.removeFromSuperview()
        }
    }

    /// Sizes each face and records its local transform. All faces are centred on
    /// the record's centre, exactly as the CSS faces are centred in `.cyl-box`.
    func layoutFaces(side: CGFloat, thickness: CGFloat) {
        let half = side / 2
        let halfThickness = thickness / 2
        let square = CGSize(width: side, height: side)
        let horizontal = CGSize(width: side, height: thickness)
        let vertical = CGSize(width: thickness, height: side)

        func size(_ view: UIView, _ value: CGSize) {
            view.bounds = CGRect(origin: .zero, size: value)
        }

        size(coverFront, square)
        size(coverBack, square)
        size(spineTop, horizontal)
        size(spineBottom, horizontal)
        size(edgeLeft, vertical)
        size(edgeRight, vertical)

        set(coverFront, CATransform3DMakeTranslation(0, 0, halfThickness))
        set(
            coverBack,
            CATransform3DTranslate(
                CATransform3DMakeRotation(.pi, 1, 0, 0), 0, 0, halfThickness
            )
        )
        set(
            spineTop,
            CATransform3DTranslate(CATransform3DMakeRotation(.pi / 2, 1, 0, 0), 0, 0, half)
        )
        set(
            spineBottom,
            CATransform3DTranslate(CATransform3DMakeRotation(-.pi / 2, 1, 0, 0), 0, 0, half)
        )
        set(
            edgeLeft,
            CATransform3DTranslate(CATransform3DMakeRotation(-.pi / 2, 0, 1, 0), 0, 0, half)
        )
        set(
            edgeRight,
            CATransform3DTranslate(CATransform3DMakeRotation(.pi / 2, 0, 1, 0), 0, 0, half)
        )

        let highlightFrame = CGRect(x: 0, y: 0, width: side, height: 0.5)
        spineTopHighlight.frame = highlightFrame
        spineBottomHighlight.frame = highlightFrame

        // `padding: 0 16px` on the spine.
        let labelFrame = CGRect(x: 16, y: 0, width: max(side - 32, 0), height: thickness)
        spineTopLabel.frame = labelFrame
        spineBottomLabel.frame = labelFrame

        for spine in [spineTop, spineBottom] {
            spine.layer.shadowPath = CGPath(
                rect: CGRect(origin: .zero, size: horizontal),
                transform: nil
            )
        }
    }

    private func set(_ view: UIView, _ transform: CATransform3D) {
        localTransforms[ObjectIdentifier(view)] = transform
    }

    /// Places every face in the stage's 3D space for the current scroll.
    func apply(sleeveTransform: CATransform3D, centre: CGPoint, distance: Double) {
        for face in faces {
            face.center = centre
            let local = localTransforms[ObjectIdentifier(face)] ?? CATransform3DIdentity
            face.layer.transform = CATransform3DConcat(local, sleeveTransform)
        }
        updateVisibility(distance: distance)
    }

    /// Hides the faces pointing away from the viewer.
    ///
    /// Composed X-rotations, from the sleeve's `90 + tilt` and each face's own
    /// rotation, with `tilt = clamp(-distance × 3, ±64)`:
    ///
    /// - spine bottom: `tilt`       → `cos > 0` for every reachable tilt, always shown
    /// - spine top:    `180 + tilt` → always facing away
    /// - cover front:  `90 + tilt`  → faces the viewer while `tilt < 0`, below centre
    /// - cover back:   `270 + tilt` → faces the viewer while `tilt > 0`, above centre
    ///
    /// This is done explicitly rather than with `isDoubleSided = false`, because
    /// Core Animation evaluates that from a layer's own transform rather than the
    /// composed chain the way CSS `backface-visibility` does.
    private func updateVisibility(distance: Double) {
        let above = distance < 0
        coverFront.isHidden = above
        coverBack.isHidden = !above
        spineTop.isHidden = true
        spineBottom.isHidden = false
    }

    func configure(with album: Album, target: CoverImageStore.Target) {
        guard albumID != album.id else { return }
        albumID = album.id
        loadTask?.cancel()

        let seeded = Self.seedColor(for: album.title + album.artist)
        setSpineText(title: album.title, artist: album.cleanedArtist, on: seeded)
        apply(edgeColor: seeded)
        coverFront.image = nil
        coverBack.image = nil

        let url = album.coverUrl
        let id = album.id
        let title = album.title
        let artist = album.cleanedArtist
        loadTask = Task { [weak self] in
            let image = await CoverImageStore.shared.image(for: url, target: target)
            let colour = await CoverImageStore.shared.edgeColor(for: url)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard let self, self.albumID == id else { return }
                self.coverFront.image = image
                self.coverBack.image = image
                if let colour {
                    self.apply(edgeColor: colour)
                    self.setSpineText(title: title, artist: artist, on: colour)
                }
            }
        }
    }

    private func setSpineText(title: String, artist: String, on background: UIColor) {
        let colour = Self.textColor(on: background)
        let text = NSMutableAttributedString(
            string: title,
            attributes: [
                .font: UIFont.systemFont(ofSize: 10, weight: .semibold),
                .foregroundColor: colour,
            ]
        )
        // `gap: 0.4em` between the two runs.
        text.append(
            NSAttributedString(
                string: "  ",
                attributes: [.font: UIFont.systemFont(ofSize: 10, weight: .semibold)]
            )
        )
        text.append(
            NSAttributedString(
                string: artist,
                attributes: [
                    .font: UIFont.systemFont(ofSize: 9, weight: .regular),
                    .foregroundColor: colour.withAlphaComponent(0.8),
                ]
            )
        )
        spineTopLabel.attributedText = text
        spineBottomLabel.attributedText = text
    }

    private func apply(edgeColor: UIColor) {
        for face in [spineTop, spineBottom, edgeLeft, edgeRight] {
            face.backgroundColor = edgeColor
        }
        // Covers use the edge colour as their backing so a missing image still
        // reads as a record rather than a hole.
        coverFront.backgroundColor = edgeColor
        coverBack.backgroundColor = edgeColor
        for bordered in [coverFront, coverBack, edgeLeft, edgeRight] {
            bordered.layer.borderColor = edgeColor.cgColor
        }
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
    /// Sleeve thickness in points, matching `--sh: 14px` in globals.css.
    /// Measured against the reference screenshots the printed spine reads about
    /// 14.7pt tall with a 10pt face, i.e. the web values — the box's solidity
    /// comes from the spine's shadow, its top highlight and the 1px cover ring,
    /// not from a thicker sleeve.
    static let sleeveThickness: CGFloat = 14

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

    private var slots: [Int: RecordSleeve] = [:]
    private var pool: [RecordSleeve] = []
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
        // CSS `perspective: 3200px` with `perspective-origin: 50% 47%`. The anchor
        // point is what a sublayerTransform is applied about, so moving it to 0.47
        // reproduces the raised vanishing point. Every record face is a direct
        // child of this view so the perspective reaches all of them.
        stage.layer.sublayerTransform = RackTuning.perspectiveTransform
        stage.layer.anchorPoint = CGPoint(x: 0.5, y: 0.47)

        // `.crate-scene-side::after` radial vignette.
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
                sleeve.layoutFaces(side: side, thickness: Self.sleeveThickness)
            }
            for sleeve in pool {
                sleeve.layoutFaces(side: side, thickness: Self.sleeveThickness)
            }
        }
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
        guard !albums.isEmpty else { return }
        let count = albums.count
        let wanted = Set((-RackTuning.range...RackTuning.range).map { renderCenter + $0 })

        for (virtualIndex, sleeve) in slots where !wanted.contains(virtualIndex) {
            sleeve.removeFaces()
            slots.removeValue(forKey: virtualIndex)
            pool.append(sleeve)
        }

        for virtualIndex in wanted.sorted() {
            let album = albums[wrapRecordIndex(virtualIndex, count)]
            let sleeve: RecordSleeve
            if let existing = slots[virtualIndex] {
                sleeve = existing
            } else {
                sleeve = pool.popLast() ?? RecordSleeve()
                if sleeveSide > 0 {
                    sleeve.layoutFaces(side: sleeveSide, thickness: Self.sleeveThickness)
                }
                sleeve.addFaces(to: stage)
                slots[virtualIndex] = sleeve
            }
            sleeve.configure(with: album, target: .sleeve)
        }

        sortByDepth()
        applyTransforms()
        _ = force
    }

    /// The web sorts the rendered records by descending distance so nearer ones
    /// paint last. Core Animation paints siblings in order and does no depth
    /// testing, so the same ordering has to be applied here. `zPosition` is not
    /// usable for this: it also translates in Z, which would change a record's
    /// apparent size under perspective.
    private func sortByDepth() {
        let ordered = slots
            .sorted { abs($0.key - renderCenter) > abs($1.key - renderCenter) }
            .map(\.value)
        for sleeve in ordered {
            for face in sleeve.faces {
                stage.bringSubviewToFront(face)
            }
        }
    }

    private func applyTransforms() {
        guard sleeveSide > 0 else { return }
        let centre = CGPoint(x: stage.bounds.midX, y: stage.bounds.midY)
        for (virtualIndex, sleeve) in slots {
            let index = Double(virtualIndex)
            sleeve.apply(
                sleeveTransform: recordRackTransform(index: index, scroll: scroll),
                centre: centre,
                distance: index - scroll
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
            // UIKit's release velocity includes the final finger movement and is
            // more stable than the last sampled move event. Using it makes short
            // flicks carry naturally, like a photo gallery, instead of feeling
            // as though the rack grabs the finger at release.
            let releaseVelocity = Double(
                -gesture.velocity(in: self).y
            ) / RackTuning.pxPerItem
            let current = min(max(releaseVelocity, -40), 40)
            if abs(current) > 0.3 {
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
