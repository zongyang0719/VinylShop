import assert from "node:assert/strict";
import test from "node:test";
import {
  computeRecordRackPose,
  nearestRecordOccurrence,
  RECORD_RACK_GEOMETRY,
  wrapRecordIndex,
} from "./recordRackGeometry.ts";

test("the centred record is side-on in this box coordinate system", () => {
  const pose = computeRecordRackPose(4, 4);
  assert.equal(pose.rotationDeg, 90);
  assert.equal(pose.y, 0);
});

test("top and bottom records keep independent linear Y positions", () => {
  const above = computeRecordRackPose(3, 4);
  const below = computeRecordRackPose(5, 4);

  assert.equal(above.y, -RECORD_RACK_GEOMETRY.itemSpacingPx);
  assert.equal(below.y, RECORD_RACK_GEOMETRY.itemSpacingPx);
  assert.equal(
    above.rotationDeg,
    90 + RECORD_RACK_GEOMETRY.anglePerItemDeg,
  );
  assert.equal(
    below.rotationDeg,
    90 - RECORD_RACK_GEOMETRY.anglePerItemDeg,
  );
});

test("the large ring keeps viewport depth shallow and symmetrical", () => {
  const above = computeRecordRackPose(0, 5);
  const below = computeRecordRackPose(10, 5);

  assert.equal(above.curveDepth, below.curveDepth);
  assert.ok(Math.abs(above.curveDepth) < 1);
});

test("an iPhone Safari viewport can expose at least twelve records", () => {
  const safariViewportHeight = 659;
  const activeIndex = 4;
  const visible = Array.from({ length: 17 }, (_, index) =>
    computeRecordRackPose(index, activeIndex),
  ).filter((pose) => Math.abs(pose.y) <= safariViewportHeight / 2 + 75);

  assert.ok(visible.length >= 12);
});

test("record indices wrap seamlessly in both directions", () => {
  assert.equal(wrapRecordIndex(97, 97), 0);
  assert.equal(wrapRecordIndex(98, 97), 1);
  assert.equal(wrapRecordIndex(-1, 97), 96);
  assert.equal(wrapRecordIndex(-98, 97), 96);
});

test("external jumps choose the nearest loop occurrence", () => {
  assert.equal(nearestRecordOccurrence(0, 96, 97), 97);
  assert.equal(nearestRecordOccurrence(96, 0, 97), -1);
  assert.equal(nearestRecordOccurrence(25, 30, 97), 25);
});

test("the loop boundary preserves one-record geometry", () => {
  const last = computeRecordRackPose(96, 97);
  const first = computeRecordRackPose(97, 97);
  const second = computeRecordRackPose(98, 97);

  assert.equal(last.y, -RECORD_RACK_GEOMETRY.itemSpacingPx);
  assert.equal(first.y, 0);
  assert.equal(second.y, RECORD_RACK_GEOMETRY.itemSpacingPx);
});
