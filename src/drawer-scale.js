const MIN_SCALE = 0.5;
const MAX_SCALE = 1.25;
const DEFAULT_SCALE = 1;
const MINIMUM_SLOT_COUNT = 3;
const SLOT_STEP = 78;
const BASE_LENGTH = 254;
const HORIZONTAL_HEIGHT = 78;
const VERTICAL_WIDTH = 72;

function normalizeScale(value) {
  const scale = Number(value);
  if (!Number.isFinite(scale)) return DEFAULT_SCALE;
  return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) * 100) / 100;
}

function scalePixels(value, scale) {
  return Math.max(1, Math.round(value * normalizeScale(scale)));
}

function drawerSize(slotCount, orientation, scale) {
  const count = Math.max(MINIMUM_SLOT_COUNT, Number(slotCount) || 0);
  const length = scalePixels(
    BASE_LENGTH + (count - MINIMUM_SLOT_COUNT) * SLOT_STEP,
    scale,
  );

  return orientation === "vertical"
    ? { width: scalePixels(VERTICAL_WIDTH, scale), height: length }
    : { width: length, height: scalePixels(HORIZONTAL_HEIGHT, scale) };
}

module.exports = {
  DEFAULT_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  drawerSize,
  normalizeScale,
  scalePixels,
};
