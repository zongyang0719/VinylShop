import assert from "node:assert/strict";
import test from "node:test";
import {
  computeRecordRackPose,
  RECORD_RACK_GEOMETRY,
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
