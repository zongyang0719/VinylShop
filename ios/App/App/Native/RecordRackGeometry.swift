import CoreGraphics
import Foundation
import QuartzCore

/// Direct port of `app/components/recordRackGeometry.ts`.
///
/// Every constant and every expression here mirrors the web implementation so
/// the native rack and the web rack move identically. Do not "improve" the maths
/// in one place only — the two must stay in lockstep.
struct RecordRackGeometry {
    var anglePerItemDeg: Double = 3
    var maxAngleDeg: Double = 64
    var itemSpacingPx: Double = 50
    var ringRadiusPx: Double = 50_000
    var focusDepthPx: Double = 4

    static let standard = RecordRackGeometry()
}

struct RecordRackPose {
    let distance: Double
    let rotationDeg: Double
    let y: Double
    let z: Double
    let curveDepth: Double
    let focus: Double
}

private func clamp(_ value: Double, _ minimum: Double, _ maximum: Double) -> Double {
    min(max(value, minimum), maximum)
}

/// Wraps an index into `0..<length`, matching JS `wrapRecordIndex`.
func wrapRecordIndex(_ index: Int, _ length: Int) -> Int {
    guard length > 0 else { return 0 }
    return ((index % length) + length) % length
}

/// Picks the occurrence of `index` closest to `reference` in the infinite
/// virtual sequence, matching JS `nearestRecordOccurrence`.
func nearestRecordOccurrence(_ index: Int, _ reference: Int, _ length: Int) -> Int {
    guard length > 0 else { return 0 }
    let normalized = wrapRecordIndex(index, length)
    let steps = (Double(reference - normalized) / Double(length)).rounded()
    return normalized + Int(steps) * length
}

func computeRecordRackPose(
    index: Double,
    scroll: Double,
    geometry: RecordRackGeometry = .standard
) -> RecordRackPose {
    let distance = index - scroll
    let y = distance * geometry.itemSpacingPx

    let tiltDeg = distance == 0
        ? 0
        : clamp(
            -distance * geometry.anglePerItemDeg,
            -geometry.maxAngleDeg,
            geometry.maxAngleDeg
        )

    // The record itself is a square XY plane. A 90deg phase makes the centred
    // record edge-on; records above reveal the back and records below the cover.
    let rotationDeg = 90 + tiltDeg

    // Position is intentionally not derived from the cover rotation. A large,
    // shallow ring controls depth while linear Y preserves even record spacing.
    let arcAngle = y / geometry.ringRadiusPx
    let curveDepth = -geometry.ringRadiusPx * (1 - cos(arcAngle))
    let focus = exp(-distance * distance * 1.6)

    return RecordRackPose(
        distance: distance,
        rotationDeg: rotationDeg,
        y: y,
        z: curveDepth + focus * geometry.focusDepthPx,
        curveDepth: curveDepth,
        focus: focus
    )
}

/// CSS writes `translateY(y) translateZ(z) rotateX(deg)`, which multiplies
/// left to right as `T(y) · T(z) · R(x)`. `CATransform3DRotate(t, …)` post-
/// multiplies, so translating first and rotating second reproduces that order.
func recordRackTransform(
    index: Double,
    scroll: Double,
    geometry: RecordRackGeometry = .standard
) -> CATransform3D {
    let pose = computeRecordRackPose(index: index, scroll: scroll, geometry: geometry)
    let translated = CATransform3DMakeTranslation(0, pose.y, pose.z)
    return CATransform3DRotate(
        translated,
        pose.rotationDeg * .pi / 180,
        1,
        0,
        0
    )
}

// MARK: - Interaction constants

/// Ported from `CrateCylinder.tsx`. Same names, same values.
enum RackTuning {
    /// Half-width of the rendered window; the rack draws `RANGE * 2 + 1` records.
    static let range = 12
    /// Drag/scroll pixels that advance the rack by one record.
    static let pxPerItem: Double = 54
    /// How fast a fling loses speed, per second.
    ///
    /// A release no longer picks a landing record and eases toward it; the rack
    /// simply coasts and is slowed by friction, which is what makes a flick
    /// carry across a dozen records and drift to a stop instead of arriving at a
    /// destination chosen at the moment the finger lifted. `UIScrollView`'s
    /// normal deceleration rate — 0.998 per millisecond — is ln(0.998)·-1000 ≈
    /// 2.0 in these units; slightly above that keeps a hard flick from crossing
    /// the whole library.
    static let flingDecay: Double = 2.3
    /// Releases slower than this settle onto the nearest record instead of
    /// coasting, in records per second.
    static let minFlingVelocity: Double = 0.9
    /// A coast this slow has run out; the rack snaps to where it was heading.
    static let settleVelocity: Double = 1.3
    /// Cap on release velocity, in records per second.
    static let maxFlingVelocity: Double = 95
    /// Exponential-convergence time constant while dragging.
    static let tauDragging: Double = 0.012
    /// Exponential-convergence time constant for the final snap onto a record.
    static let tauSettle: Double = 0.16
    /// Time constant used when Reduce Motion is on.
    static let tauReducedMotion: Double = 0.001
    /// CSS `perspective: 3200px` on `.cyl-viewport`.
    static let perspective: Double = 3200
    /// Movement past this many points counts as a drag rather than a tap.
    static let dragSlop: Double = 6
}

extension RackTuning {
    /// `sublayerTransform.m34` that reproduces a CSS perspective of the same value.
    static var perspectiveTransform: CATransform3D {
        var transform = CATransform3DIdentity
        transform.m34 = -1 / CGFloat(perspective)
        return transform
    }
}
