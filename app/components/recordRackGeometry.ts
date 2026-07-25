export type RecordRackGeometry = {
  anglePerItemDeg: number;
  maxAngleDeg: number;
  itemSpacingPx: number;
  ringRadiusPx: number;
  focusDepthPx: number;
};

export const RECORD_RACK_GEOMETRY: RecordRackGeometry = {
  anglePerItemDeg: 3,
  maxAngleDeg: 64,
  itemSpacingPx: 50,
  ringRadiusPx: 50000,
  focusDepthPx: 4,
};

export type RecordRackPose = {
  distance: number;
  rotationDeg: number;
  y: number;
  z: number;
  curveDepth: number;
  focus: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function wrapRecordIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

export function nearestRecordOccurrence(
  index: number,
  reference: number,
  length: number,
) {
  if (length <= 0) return 0;
  const normalized = wrapRecordIndex(index, length);
  return (
    normalized +
    Math.round((reference - normalized) / length) * length
  );
}

export function computeRecordRackPose(
  index: number,
  scroll: number,
  geometry: RecordRackGeometry = RECORD_RACK_GEOMETRY,
): RecordRackPose {
  const distance = index - scroll;
  const y = distance * geometry.itemSpacingPx;

  const tiltDeg =
    distance === 0
      ? 0
      : clamp(
          -distance * geometry.anglePerItemDeg,
          -geometry.maxAngleDeg,
          geometry.maxAngleDeg,
        );

  // The record itself is a square XY plane. A 90deg phase makes the centred
  // record edge-on; records above reveal the back and records below the cover.
  const rotationDeg = 90 + tiltDeg;

  // Position is intentionally not derived from the cover rotation. A large,
  // shallow ring controls depth while linear Y preserves even record spacing.
  const arcAngle = y / geometry.ringRadiusPx;
  const curveDepth =
    -geometry.ringRadiusPx * (1 - Math.cos(arcAngle));
  const focus = Math.exp(-distance * distance * 1.6);

  return {
    distance,
    rotationDeg,
    y,
    z: curveDepth + focus * geometry.focusDepthPx,
    curveDepth,
    focus,
  };
}

export function recordRackTransform(index: number, scroll: number) {
  const pose = computeRecordRackPose(index, scroll);
  return [
    `translateY(${pose.y.toFixed(1)}px)`,
    `translateZ(${pose.z.toFixed(1)}px)`,
    `rotateX(${pose.rotationDeg.toFixed(2)}deg)`,
  ].join(" ");
}
