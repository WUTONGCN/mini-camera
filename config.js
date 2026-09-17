function normalizeConfig(saved, defaults, exists) {
  const config = { ...defaults, videoList: [] };
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return config;
  if (Number.isFinite(saved.size)) config.size = Math.round(Math.max(100, Math.min(500, saved.size)));
  if (['circle', 'square', 'rounded'].includes(saved.shape)) config.shape = saved.shape;
  if (Number.isFinite(saved.opacity)) config.opacity = Math.max(0.2, Math.min(1, saved.opacity));
  if (typeof saved.alwaysOnTop === 'boolean') config.alwaysOnTop = saved.alwaysOnTop;
  if (['camera', 'video'].includes(saved.sourceMode)) config.sourceMode = saved.sourceMode;
  if (typeof saved.cameraDeviceId === 'string') config.cameraDeviceId = saved.cameraDeviceId;
  if (Array.isArray(saved.videoList)) {
    config.videoList = saved.videoList.filter((item) => typeof item === 'string' && exists(item));
  }
  if (saved.defaultsVersion !== defaults.defaultsVersion) {
    config.size = defaults.size;
    config.shape = defaults.shape;
  }
  return config;
}

module.exports = { normalizeConfig };
