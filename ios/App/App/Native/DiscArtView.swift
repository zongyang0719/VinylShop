import SwiftUI
import UIKit

// MARK: - Vinyl style

/// Mirrors `VinylStyle` in app/lib/store.ts and `VINYL_STYLES` in InspectModal.tsx.
enum VinylStyleKind: String, CaseIterable, Identifiable {
    case standard
    case transparent
    case picture
    case splatter

    var id: String { rawValue }

    /// Label used by the edit form's material picker.
    var label: String {
        switch self {
        case .standard: "普通"
        case .transparent: "透明胶"
        case .picture: "画胶"
        case .splatter: "泼溅"
        }
    }

    /// Short suffix used by the version tabs, matching `versionLabel`.
    var badge: String {
        switch self {
        case .standard: ""
        case .transparent: "透明"
        case .picture: "画胶"
        case .splatter: "泼溅"
        }
    }

    init(_ raw: String?) {
        self = VinylStyleKind(rawValue: raw ?? "") ?? .standard
    }
}

// MARK: - Colour

/// Presets and hex conversion for the vinyl colour, matching `VINYL_COLORS`.
enum VinylPalette {
    static let defaultHex = "#1a1a1a"

    static let presets: [(hex: String, label: String)] = [
        ("#1a1a1a", "经典黑"),
        ("#a43a36", "红"),
        ("#376f9f", "蓝"),
        ("#397a58", "绿"),
        ("#bd6b32", "橙"),
        ("#705287", "紫"),
        ("#bd557d", "粉"),
        ("#a88934", "金"),
        ("#e8e8e8", "白"),
        ("#a8b4c0", "透明"),
    ]

    /// `#1a1a1a`, the colour the web falls back to for a record without one.
    static let defaultColor = Color(red: 0.102, green: 0.102, blue: 0.102)

    /// The colour a record is drawn with.
    static func color(_ hex: String?) -> Color {
        guard let hex else { return defaultColor }
        return Color(vinylHex: hex) ?? defaultColor
    }
}

extension Color {
    /// Parses `#RGB`, `#RRGGBB` and the same without the leading hash.
    init?(vinylHex hex: String) {
        var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") {
            value.removeFirst()
        }
        if value.count == 3 {
            value = value.map { "\($0)\($0)" }.joined()
        }
        guard value.count == 6, let number = UInt32(value, radix: 16) else { return nil }
        self.init(
            red: Double((number >> 16) & 0xff) / 255,
            green: Double((number >> 8) & 0xff) / 255,
            blue: Double(number & 0xff) / 255
        )
    }

    /// `#rrggbb`, so a colour picked with the system control round-trips into
    /// the same field the web writes.
    var vinylHex: String {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        UIColor(self).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        func channel(_ value: CGFloat) -> Int {
            Int((min(max(value, 0), 1) * 255).rounded())
        }
        return String(
            format: "#%02x%02x%02x",
            channel(red),
            channel(green),
            channel(blue)
        )
    }
}

// MARK: - Vinyl disc

/// Direct port of `VinylDisc.tsx`. Every radius is expressed relative to the
/// disc so the drawing matches the web at any size; the literal offsets are
/// scaled from the web's 520pt reference.
struct VinylDiscView: View {
    var color: Color
    var style: VinylStyleKind = .standard
    var artwork: UIImage?

    private static let grooveCount = 32

    /// Mirrors `seededUnit`.
    private static func seededUnit(_ index: Int, _ salt: Int) -> Double {
        let value = sin(Double(index + 1) * 12.9898 + Double(salt) * 78.233) * 43758.5453
        return value - floor(value)
    }

    var body: some View {
        Canvas(rendersAsynchronously: false) { context, size in
            let side = min(size.width, size.height)
            let radius = side / 2
            let centre = CGPoint(x: size.width / 2, y: size.height / 2)
            // The web's pixel offsets are authored against a 520pt disc.
            let unit = radius / 260

            let labelRadius = radius * 0.33
            let holeRadius = radius * 0.04
            let grooveStart = labelRadius + 4 * unit
            let grooveEnd = radius - 6 * unit
            let grooveStep = (grooveEnd - grooveStart) / Double(Self.grooveCount)

            func circle(_ r: Double) -> Path {
                Path(
                    ellipseIn: CGRect(
                        x: centre.x - r,
                        y: centre.y - r,
                        width: r * 2,
                        height: r * 2
                    )
                )
            }

            let body = circle(radius - unit)
            let isPicture = style == .picture
            let isTransparent = style == .transparent

            // Disc body: artwork for a picture disc, the chosen colour otherwise.
            if isPicture, let artwork {
                context.drawLayer { layer in
                    layer.clip(to: body)
                    layer.opacity = 0.85
                    layer.draw(
                        Image(uiImage: artwork),
                        in: aspectFillRect(artwork.size, in: body.boundingRect)
                    )
                }
            } else {
                context.fill(body, with: .color(color.opacity(isTransparent ? 0.45 : 1)))
            }
            context.stroke(body, with: .color(.black.opacity(0.25)), lineWidth: unit)

            // Splatter flecks, laid out on the same golden-angle spiral.
            if style == .splatter {
                context.drawLayer { layer in
                    layer.clip(to: body)
                    layer.opacity = 0.5
                    for index in 0..<18 {
                        let angle = Double(index) * 137.5 * .pi / 180
                        let distance = grooveStart
                            + Self.seededUnit(index, 1) * (grooveEnd - grooveStart) * 0.9
                        let point = CGPoint(
                            x: centre.x + cos(angle) * distance * 0.7,
                            y: centre.y + sin(angle) * distance * 0.7
                        )
                        let fleck = (4 + Self.seededUnit(index, 2) * 14) * unit
                        layer.fill(
                            Path(
                                ellipseIn: CGRect(
                                    x: point.x - fleck,
                                    y: point.y - fleck,
                                    width: fleck * 2,
                                    height: fleck * 2
                                )
                            ),
                            with: .color(
                                .white.opacity(0.3 + Self.seededUnit(index, 3) * 0.4)
                            )
                        )
                    }
                }
            }

            // Grooves. The web multiplies a translucent stroke by an equally
            // translucent `opacity`; at a phone-sized disc that product rounds
            // away, so the two are folded into one alpha that still reads as
            // fine concentric texture.
            let grooveTint: Color = isPicture ? .black : .white
            let grooveAlpha = isTransparent ? 0.09 : 0.06
            for index in 0..<Self.grooveCount {
                context.stroke(
                    circle(grooveStart + Double(index) * grooveStep),
                    with: .color(
                        grooveTint.opacity(grooveAlpha + (index % 3 == 0 ? 0.03 : 0))
                    ),
                    lineWidth: 0.5 * unit
                )
            }

            // Sheen: highlight in the middle falling off to a darkened rim.
            context.fill(
                body,
                with: .radialGradient(
                    Gradient(stops: [
                        .init(color: .white.opacity(0.08), location: 0),
                        .init(color: .clear, location: 0.6),
                        .init(color: .black.opacity(0.15), location: 1),
                    ]),
                    center: centre,
                    startRadius: 0,
                    endRadius: radius
                )
            )

            // Label: the cover art, or a plain dark disc when it has not loaded.
            let label = circle(labelRadius)
            if let artwork {
                context.drawLayer { layer in
                    layer.clip(to: label)
                    layer.draw(
                        Image(uiImage: artwork),
                        in: aspectFillRect(artwork.size, in: label.boundingRect)
                    )
                }
            } else {
                context.fill(label, with: .color(Color(white: 0.17)))
            }
            context.stroke(
                label,
                with: .color(.white.opacity(0.1)),
                lineWidth: 0.5 * unit
            )
            context.stroke(
                circle(labelRadius - 3 * unit),
                with: .color(.white.opacity(0.06)),
                lineWidth: 0.5 * unit
            )

            // Spindle hole.
            let hole = circle(holeRadius)
            context.fill(hole, with: .color(Color(white: 0.05)))
            context.stroke(
                hole,
                with: .color(.white.opacity(0.15)),
                lineWidth: 0.5 * unit
            )
        }
        .aspectRatio(1, contentMode: .fit)
    }
}

// MARK: - CD

/// Port of `CdDisc.tsx`: silver body, rainbow refraction, printed centre.
struct CdDiscView: View {
    var artwork: UIImage?

    var body: some View {
        Canvas(rendersAsynchronously: false) { context, size in
            let side = min(size.width, size.height)
            let radius = side / 2
            let centre = CGPoint(x: size.width / 2, y: size.height / 2)
            let unit = radius / 260
            let holeRadius = radius * 0.07
            let ringRadius = radius * 0.19
            let artRadius = radius * 0.34

            func circle(_ r: Double) -> Path {
                Path(
                    ellipseIn: CGRect(
                        x: centre.x - r,
                        y: centre.y - r,
                        width: r * 2,
                        height: r * 2
                    )
                )
            }

            let body = circle(radius - 0.5 * unit)
            context.fill(body, with: .color(Color(red: 0.784, green: 0.8, blue: 0.816)))

            // Data-track micro rings.
            for index in 0..<48 {
                let r = ringRadius + 6 * unit
                    + Double(index) * ((radius - ringRadius - 10 * unit) / 48)
                context.stroke(
                    circle(r),
                    with: .color(
                        index % 4 == 0
                            ? Color(red: 0.7, green: 0.75, blue: 0.78).opacity(0.25)
                            : Color(red: 0.78, green: 0.82, blue: 0.86).opacity(0.12)
                    ),
                    lineWidth: 0.4 * unit
                )
            }

            // Rainbow refraction.
            context.fill(
                body,
                with: .linearGradient(
                    Gradient(stops: [
                        .init(color: Color(red: 0.91, green: 0.84, blue: 0.96).opacity(0.5), location: 0),
                        .init(color: Color(red: 0.77, green: 0.88, blue: 0.98).opacity(0.45), location: 0.18),
                        .init(color: Color(red: 0.82, green: 0.94, blue: 0.88).opacity(0.4), location: 0.36),
                        .init(color: Color(red: 0.96, green: 0.94, blue: 0.78).opacity(0.45), location: 0.54),
                        .init(color: Color(red: 0.96, green: 0.82, blue: 0.78).opacity(0.4), location: 0.72),
                        .init(color: Color(red: 0.91, green: 0.78, blue: 0.94).opacity(0.5), location: 0.9),
                        .init(color: Color(red: 0.82, green: 0.85, blue: 0.97).opacity(0.45), location: 1),
                    ]),
                    startPoint: CGPoint(x: centre.x - radius, y: centre.y - radius),
                    endPoint: CGPoint(x: centre.x + radius, y: centre.y + radius)
                )
            )

            context.fill(
                body,
                with: .radialGradient(
                    Gradient(stops: [
                        .init(color: .white.opacity(0.35), location: 0),
                        .init(color: .white.opacity(0.08), location: 0.4),
                        .init(color: .clear, location: 0.75),
                        .init(color: .black.opacity(0.1), location: 1),
                    ]),
                    center: CGPoint(
                        x: centre.x - radius * 0.3,
                        y: centre.y - radius * 0.3
                    ),
                    startRadius: 0,
                    endRadius: radius * 1.4
                )
            )

            // Ring-shaped colour fringes.
            let fringes: [(Double, Color)] = [
                (0.42, Color(red: 0.7, green: 0.55, blue: 1).opacity(0.12)),
                (0.55, Color(red: 0.39, green: 0.78, blue: 1).opacity(0.1)),
                (0.68, Color(red: 0.55, green: 1, blue: 0.7).opacity(0.08)),
                (0.78, Color(red: 1, green: 0.86, blue: 0.39).opacity(0.1)),
                (0.88, Color(red: 1, green: 0.59, blue: 0.7).opacity(0.09)),
            ]
            for (index, fringe) in fringes.enumerated() {
                context.stroke(
                    circle(radius * fringe.0),
                    with: .color(fringe.1),
                    lineWidth: (2 + Double(index) * 0.5) * unit
                )
            }

            // Printed centre.
            let art = circle(artRadius)
            if let artwork {
                context.drawLayer { layer in
                    layer.clip(to: art)
                    layer.draw(
                        Image(uiImage: artwork),
                        in: aspectFillRect(artwork.size, in: art.boundingRect)
                    )
                }
            } else {
                context.fill(art, with: .color(Color(white: 0.88)))
            }
            context.stroke(art, with: .color(.black.opacity(0.12)), lineWidth: 0.5 * unit)

            let clampRing = circle(ringRadius)
            context.fill(clampRing, with: .color(Color(white: 0.95).opacity(0.85)))
            context.stroke(clampRing, with: .color(.black.opacity(0.08)), lineWidth: 0.5 * unit)

            let hole = circle(holeRadius)
            context.fill(hole, with: .color(Color(white: 0.98)))
            context.stroke(hole, with: .color(.black.opacity(0.18)), lineWidth: 0.5 * unit)
        }
        .aspectRatio(1, contentMode: .fit)
    }
}

/// Fills `bounds` with an image of `imageSize`, preserving its aspect ratio —
/// the drawing equivalent of `preserveAspectRatio="xMidYMid slice"`.
private func aspectFillRect(_ imageSize: CGSize, in bounds: CGRect) -> CGRect {
    guard imageSize.width > 0, imageSize.height > 0 else { return bounds }
    let scale = max(
        bounds.width / imageSize.width,
        bounds.height / imageSize.height
    )
    let width = imageSize.width * scale
    let height = imageSize.height * scale
    return CGRect(
        x: bounds.midX - width / 2,
        y: bounds.midY - height / 2,
        width: width,
        height: height
    )
}

// MARK: - Spin

/// Rotates its content with a physical spin-up and spin-down.
///
/// A `repeatForever` rotation cannot be stopped where it stands — SwiftUI does
/// not expose the presented angle — so the angle is a pure function of elapsed
/// time instead, integrated from an exponential approach to full speed and an
/// exponential decay back to rest. The timeline pauses once the platter has
/// settled, so a still disc costs nothing.
struct SpinningDisc<Content: View>: View {
    var spinning: Bool
    /// Seconds per revolution at full speed.
    var period: Double = 3.2
    @ViewBuilder var content: Content

    @State private var anchorAngle: Double = 0
    @State private var anchorSpeed: Double = 0
    @State private var anchorDate = Date.distantPast
    @State private var settled = true
    @State private var settleTask: Task<Void, Never>?

    private static var rampUp: Double { 0.5 }
    private static var rampDown: Double { 0.9 }

    private var fullSpeed: Double { 360 / period }

    private func elapsed(_ date: Date) -> Double {
        max(date.timeIntervalSince(anchorDate), 0)
    }

    private func angle(at date: Date) -> Double {
        let delta = elapsed(date)
        if spinning {
            let tau = Self.rampUp
            return anchorAngle + fullSpeed * delta
                - (fullSpeed - anchorSpeed) * tau * (1 - exp(-delta / tau))
        }
        let tau = Self.rampDown
        return anchorAngle + anchorSpeed * tau * (1 - exp(-delta / tau))
    }

    private func speed(at date: Date) -> Double {
        let delta = elapsed(date)
        if spinning {
            return fullSpeed - (fullSpeed - anchorSpeed) * exp(-delta / Self.rampUp)
        }
        return anchorSpeed * exp(-delta / Self.rampDown)
    }

    var body: some View {
        TimelineView(.animation(paused: !spinning && settled)) { context in
            content
                .rotationEffect(.degrees(angle(at: context.date)))
        }
        .onChange(of: spinning) { _, isSpinning in
            let now = Date()
            anchorAngle = angle(at: now)
            anchorSpeed = speed(at: now)
            anchorDate = now
            settled = false
            settleTask?.cancel()
            guard !isSpinning else { return }
            settleTask = Task {
                try? await Task.sleep(for: .seconds(Self.rampDown * 7))
                guard !Task.isCancelled else { return }
                settled = true
            }
        }
        .onDisappear { settleTask?.cancel() }
    }
}
