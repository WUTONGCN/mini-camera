const { ipc: ipcRenderer, buildMediaFileUrl } = window.miniCamera;

const container = document.getElementById('container');
const interactionLayer = document.getElementById('interaction-layer');
const cameraVideo = document.getElementById('camera');
const localVideo = document.getElementById('video');
const placeholder = document.getElementById('placeholder');
const placeholderTitle = document.getElementById('placeholder-title');
const placeholderDescription = document.getElementById('placeholder-description');
const placeholderHint = document.getElementById('placeholder-hint');
const statusStrip = document.getElementById('status-strip');
const statusText = document.getElementById('status-text');

let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

let currentSource = 'camera';
let selectedCameraDeviceId = '';
let videoList = [];
let currentVideoIndex = 0;
let cameraStream = null;
let cameraGeneration = 0;
let playbackGeneration = 0;
let statusTimer = null;
let persistentStatus = '';
let persistentStatusKind = 'neutral';

function setShape(shape) {
  container.classList.remove('shape-circle', 'shape-square', 'shape-rounded');
  container.classList.add(`shape-${shape}`);
}

function renderStatus(message, kind = 'neutral') {
  if (!message) {
    statusStrip.classList.remove('is-visible');
    statusText.textContent = '';
    statusStrip.dataset.kind = 'neutral';
    statusStrip.removeAttribute('title');
    return;
  }

  statusStrip.dataset.kind = kind;
  statusText.textContent = message;
  statusStrip.title = message;
  statusStrip.classList.add('is-visible');
}

function setPersistentStatus(message = '', kind = 'neutral') {
  persistentStatus = message;
  persistentStatusKind = kind;

  if (!statusTimer) {
    renderStatus(message, kind);
  }
}

function showStatus(message, kind = 'info', duration = 1800) {
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }

  renderStatus(message, kind);

  if (duration <= 0) {
    return;
  }

  statusTimer = setTimeout(() => {
    statusTimer = null;

    if (persistentStatus) {
      renderStatus(persistentStatus, persistentStatusKind);
      return;
    }

    renderStatus('');
  }, duration);
}

function getFileName(filePath) {
  return filePath.split(/[/\\]/).pop() || '';
}

function buildVideoCaption() {
  if (!videoList.length) {
    return '';
  }

  return `[${currentVideoIndex + 1}/${videoList.length}] ${getFileName(videoList[currentVideoIndex])}`;
}

function showPlaceholder({ title, description, hint }) {
  cameraVideo.classList.add('hidden');
  localVideo.classList.add('hidden');
  placeholder.classList.remove('hidden');
  placeholderTitle.textContent = title;
  placeholderDescription.textContent = description;
  placeholderHint.textContent = hint;
  setPersistentStatus('');
}

function showEmptyState(reason = 'camera-missing') {
  if (reason === 'video-empty') {
    showPlaceholder({
      title: '还没有视频源',
      description: '当前处于视频模式，但还没有可播放的历史文件。',
      hint: '右键打开菜单选择视频文件，或切回摄像头。'
    });
    return;
  }

  if (reason === 'video-error') {
    showPlaceholder({
      title: '视频暂时无法播放',
      description: '当前文件可能损坏，或编码格式暂时不受支持。',
      hint: '右键打开菜单重新选择视频，或切回摄像头。'
    });
    return;
  }

  showPlaceholder({
    title: '未连接摄像头',
    description: '暂时没有检测到可用摄像头，主窗会保持轻量空态。',
    hint: '右键打开菜单切到视频，或调整窗口设置。'
  });
}

function showCameraAccessState(access) {
  const status = access?.status || 'unknown';

  if (status === 'denied' || status === 'restricted') {
    showPlaceholder({
      title: '摄像头权限未开启',
      description: 'macOS 当前没有允许 MiniCamera 使用摄像头。',
      hint: '右键打开菜单里的摄像头权限设置，允许 MiniCamera 后重启应用。'
    });
    return;
  }

  showPlaceholder({
    title: '摄像头权限不可用',
    description: `系统返回的权限状态是 ${status}。`,
    hint: '右键打开菜单里的摄像头权限设置，确认 MiniCamera 已被允许。'
  });
}

function showCameraError(error) {
  const errorName = error?.name || 'UnknownError';

  if (errorName === 'NotAllowedError' || errorName === 'SecurityError' || errorName === 'PermissionDeniedError') {
    showPlaceholder({
      title: '摄像头权限被拒绝',
      description: '系统或 Electron 没有放行摄像头访问。',
      hint: '右键打开菜单里的摄像头权限设置，允许后重启 MiniCamera。'
    });
    return;
  }

  if (errorName === 'OverconstrainedError' || errorName === 'ConstraintNotSatisfiedError') {
    showPlaceholder({
      title: '所选摄像头不可用',
      description: '当前选择的摄像头没有返回可播放的画面。',
      hint: '右键打开菜单，换一个摄像头设备或选择系统默认摄像头。'
    });
    return;
  }

  if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
    showPlaceholder({
      title: '未检测到摄像头',
      description: '系统没有返回可用的视频输入设备。',
      hint: '确认摄像头已连接，或先在系统设置里检查摄像头权限。'
    });
    return;
  }

  if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
    showPlaceholder({
      title: '摄像头被占用',
      description: '摄像头可能正在被其他软件占用。',
      hint: '关闭其他正在使用摄像头的软件，然后右键切回摄像头。'
    });
    return;
  }

  showPlaceholder({
    title: '摄像头启动失败',
    description: error?.message || '摄像头流已经请求，但画面没有成功开始播放。',
    hint: '右键切回摄像头重试；如果仍失败，请检查系统摄像头权限。'
  });
}

function buildCameraConstraints() {
  const video = {
    width: { ideal: 640 },
    height: { ideal: 480 }
  };

  if (selectedCameraDeviceId) {
    video.deviceId = { exact: selectedCameraDeviceId };
  }

  return {
    video,
    audio: false
  };
}

async function refreshCameraDevices() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) {
      ipcRenderer.send('camera-devices-updated', []);
      return [];
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `摄像头 ${index + 1}`
      }));

    ipcRenderer.send('camera-devices-updated', cameras);
    return cameras;
  } catch (error) {
    console.error('刷新摄像头列表失败:', error);
    ipcRenderer.send('camera-devices-updated', []);
    return [];
  }
}

async function startCamera({ announce = false } = {}) {
  currentSource = 'camera';
  stopVideo();
  stopCamera();
  const generation = cameraGeneration;

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前运行环境不支持 navigator.mediaDevices.getUserMedia。');
    }

    const access = await ipcRenderer.invoke('request-camera-access');
    if (generation !== cameraGeneration) return false;

    if (access?.granted === false) {
      showCameraAccessState(access);
      return false;
    }

    const stream = await navigator.mediaDevices.getUserMedia(buildCameraConstraints());
    if (generation !== cameraGeneration) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }
    cameraStream = stream;

    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play();
    if (generation !== cameraGeneration) return false;
    cameraVideo.classList.remove('hidden');
    localVideo.classList.add('hidden');
    placeholder.classList.add('hidden');
    currentSource = 'camera';
    setPersistentStatus('');
    await refreshCameraDevices();

    if (announce) {
      showStatus('已切到摄像头', 'success', 1600);
    }

    return true;
  } catch (error) {
    if (generation !== cameraGeneration) return false;
    console.error('无法访问摄像头:', error);
    stopCamera();
    currentSource = 'camera';
    showCameraError(error);
    return false;
  }
}

function stopCamera() {
  cameraGeneration += 1;
  if (!cameraStream) {
    cameraVideo.srcObject = null;
    return;
  }

  cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraVideo.srcObject = null;
}

function stopVideo() {
  playbackGeneration += 1;
  localVideo.pause();
  localVideo.removeAttribute('src');
  localVideo.load();
  localVideo.classList.add('hidden');
}

function playCurrentVideo({ announce = false, attempts = 0 } = {}) {
  const generation = ++playbackGeneration;
  if (!videoList.length) {
    showEmptyState('video-empty');
    return;
  }

  const videoPath = videoList[currentVideoIndex];
  const videoUrl = buildMediaFileUrl(videoPath);

  localVideo.src = videoUrl;
  localVideo.classList.remove('hidden');
  cameraVideo.classList.add('hidden');
  placeholder.classList.add('hidden');

  setPersistentStatus(buildVideoCaption(), 'neutral');

  localVideo.play().catch((error) => {
    if (generation !== playbackGeneration || currentSource !== 'video') return;
    console.error('视频播放失败:', error);

    if (attempts + 1 < videoList.length) {
      currentVideoIndex = (currentVideoIndex + 1) % videoList.length;
      playCurrentVideo({ attempts: attempts + 1 });
      return;
    }

    showEmptyState('video-error');
  });

  if (announce) {
    showStatus('已切到视频', 'success', 1600);
  }
}

function playVideoList(paths, { announce = false } = {}) {
  stopCamera();
  stopVideo();
  if (!paths || paths.length === 0) {
    currentSource = 'video';
    showEmptyState('video-empty');
    return;
  }

  videoList = [...paths];
  currentVideoIndex = 0;
  currentSource = 'video';
  playCurrentVideo({ announce });
}

function bindDragEvents() {
  interactionLayer.addEventListener('mousedown', (event) => {
    if (event.button !== 0) {
      return;
    }

    isDragging = true;
    dragStartX = event.screenX;
    dragStartY = event.screenY;
  });

  document.addEventListener('mousemove', (event) => {
    if (!isDragging) {
      return;
    }

    const deltaX = event.screenX - dragStartX;
    const deltaY = event.screenY - dragStartY;
    dragStartX = event.screenX;
    dragStartY = event.screenY;
    ipcRenderer.send('drag-move', deltaX, deltaY);
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

function bindMediaEvents() {
  localVideo.addEventListener('ended', () => {
    if (videoList.length > 1) {
      currentVideoIndex = (currentVideoIndex + 1) % videoList.length;
      playCurrentVideo();
      return;
    }

    localVideo.currentTime = 0;
    localVideo.play().catch((error) => {
      console.error('视频循环播放失败:', error);
      showEmptyState('video-error');
    });
  });

  localVideo.addEventListener('error', () => {
    if (currentSource === 'video') {
      showEmptyState('video-error');
    }
  });

  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      refreshCameraDevices();
    });
  }
}

function bindWindowEvents() {
  container.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    ipcRenderer.send('show-context-menu');
  });

  interactionLayer.addEventListener('wheel', (event) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 20 : -20;
    ipcRenderer.send('resize-window', delta);
  }, { passive: false });
}

function bindIpcEvents() {
  ipcRenderer.on('switch-source', async (event, source, payload) => {
    if (source === 'camera') {
      selectedCameraDeviceId = payload?.deviceId || '';
      await startCamera({ announce: true });
      return;
    }

    if (source === 'video') {
      playVideoList(payload, { announce: true });
    }
  });

  ipcRenderer.on('set-shape', (event, shape) => {
    setShape(shape);
  });

  ipcRenderer.on('set-size', (event, size) => {
    showStatus(`尺寸切到 ${size}px`, 'success', 1200);
  });

  ipcRenderer.on('refresh-camera-devices', () => {
    refreshCameraDevices();
  });
}

async function init() {
  bindDragEvents();
  bindMediaEvents();
  bindWindowEvents();
  bindIpcEvents();

  const config = await ipcRenderer.invoke('get-config');

  currentSource = config.sourceMode || 'camera';
  selectedCameraDeviceId = config.cameraDeviceId || '';
  videoList = config.videoList || [];

  setShape(config.shape || 'circle');
  refreshCameraDevices();

  if (currentSource === 'video') {
    if (videoList.length > 0) {
      playVideoList(videoList);
    } else {
      showEmptyState('video-empty');
    }
    return;
  }

  await startCamera();
}

window.addEventListener('beforeunload', () => { stopCamera(); stopVideo(); });
init();
