const SIZE_PRESETS = [150, 200, 300, 400];

function getNextPresetSize(currentSize) {
  const presetIndex = SIZE_PRESETS.indexOf(currentSize);

  if (presetIndex >= 0) {
    return SIZE_PRESETS[(presetIndex + 1) % SIZE_PRESETS.length];
  }

  const largerPreset = SIZE_PRESETS.find((size) => currentSize < size);
  return largerPreset || SIZE_PRESETS[0];
}

function resolveSourceToggle({ sourceMode, videoList = [] }) {
  if (sourceMode === 'video') {
    return { kind: 'switch-to-camera' };
  }

  if (videoList.length > 0) {
    return {
      kind: 'switch-to-video',
      videoList: [...videoList]
    };
  }

  return { kind: 'pick-video' };
}

module.exports = {
  SIZE_PRESETS,
  getNextPresetSize,
  resolveSourceToggle
};
