const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, screen, nativeImage, session, shell, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const { normalizeConfig } = require('./config');
const { pathToFileURL } = require('node:url');
const { SIZE_PRESETS } = require('./window-behavior');

if (process.platform === 'win32') {
  app.disableHardwareAcceleration();
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
}

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
const VIDEO_FILTERS = [
  { name: '视频文件', extensions: ['mp4', 'avi', 'mkv', 'mov', 'webm'] }
];
const DEFAULTS_VERSION = 3;
const DEFAULT_WINDOW_CONFIG = {
  size: 150,
  shape: 'circle',
  opacity: 1.0,
  alwaysOnTop: true,
  sourceMode: 'camera',
  cameraDeviceId: '',
  videoList: [],
  defaultsVersion: DEFAULTS_VERSION
};

let mainWindow = null;
let tray = null;
let cameraDevices = [];

let windowConfig = { ...DEFAULT_WINDOW_CONFIG };

function normalizeCameraDevices(devices = []) {
  return (Array.isArray(devices) ? devices : [])
    .filter((device) => device && device.deviceId)
    .map((device, index) => ({
      deviceId: String(device.deviceId),
      label: String(device.label || `摄像头 ${index + 1}`)
    }));
}

function configureMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    if (permission !== 'media') {
      callback(false);
      return;
    }

    const isMainWindow = Boolean(mainWindow && webContents.id === mainWindow.webContents.id);
    const mediaTypes = details.mediaTypes || [];
    const wantsVideoOnly = mediaTypes.length > 0 && mediaTypes.every((type) => type === 'video');
    callback(isMainWindow && wantsVideoOnly);
  });
}

async function requestCameraAccess() {
  if (process.platform !== 'darwin') {
    return { granted: true, status: 'not-applicable' };
  }

  const status = systemPreferences.getMediaAccessStatus('camera');

  if (status === 'granted') {
    return { granted: true, status };
  }

  if (status === 'not-determined') {
    const granted = await systemPreferences.askForMediaAccess('camera');
    return {
      granted,
      status: granted ? 'granted' : systemPreferences.getMediaAccessStatus('camera')
    };
  }

  return { granted: false, status };
}

function openCameraSettings() {
  if (process.platform !== 'darwin') {
    return;
  }

  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera');
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return;
    }

    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const saved = JSON.parse(data);

    windowConfig = normalizeConfig(saved, DEFAULT_WINDOW_CONFIG, fs.existsSync);
  } catch (error) {
    console.error('加载配置失败:', error);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(windowConfig, null, 2), 'utf-8');
  } catch (error) {
    console.error('保存配置失败:', error);
  }
}

function sendToRenderer(channel, ...args) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, ...args);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: windowConfig.size,
    height: windowConfig.size,
    x: screenWidth - windowConfig.size - 50,
    y: 50,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: windowConfig.alwaysOnTop,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setOpacity(windowConfig.opacity);
  mainWindow.once('ready-to-show', () => {
    showMainWindow();
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function toggleWindowVisibility() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
    return;
  }

  showMainWindow();
}

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('迷你摄像头');
  updateTrayMenu();

  tray.on('click', () => {
    toggleWindowVisibility();
  });
}

function buildContextMenu({ includeVisibilityToggle = false } = {}) {
  const template = [];

  if (includeVisibilityToggle) {
    template.push({
      label: '显示/隐藏窗口',
      click: () => {
        toggleWindowVisibility();
      }
    });
    template.push({ type: 'separator' });
  } else {
    template.push({
      label: '隐藏窗口',
      click: () => {
        mainWindow?.hide();
      }
    });
    template.push({ type: 'separator' });
  }

  template.push(
    {
      label: '视频源',
      submenu: [
        {
          label: '摄像头',
          submenu: [
            {
              label: '系统默认摄像头',
              type: 'radio',
              checked: windowConfig.sourceMode === 'camera' && !windowConfig.cameraDeviceId,
              click: () => {
                switchToCamera('');
              }
            },
            ...cameraDevices.map((device) => ({
              label: device.label,
              type: 'radio',
              checked: windowConfig.sourceMode === 'camera' && windowConfig.cameraDeviceId === device.deviceId,
              click: () => {
                switchToCamera(device.deviceId);
              }
            })),
            { type: 'separator' },
            {
              label: '刷新摄像头列表',
              click: () => {
                sendToRenderer('refresh-camera-devices');
              }
            },
            {
              label: '打开摄像头权限设置...',
              visible: process.platform === 'darwin',
              click: () => {
                openCameraSettings();
              }
            }
          ]
        },
        {
          label: '🎬 当前视频列表',
          type: 'radio',
          enabled: windowConfig.videoList.length > 0,
          checked: windowConfig.sourceMode === 'video' && windowConfig.videoList.length > 0,
          click: async () => {
            if (!switchToVideo(windowConfig.videoList)) {
              await pickAndSwitchToVideo();
            }
          }
        },
        {
          label: '🎞 选择视频文件...',
          click: async () => {
            await pickAndSwitchToVideo();
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: '窗口大小',
      submenu: SIZE_PRESETS.map((size) => ({
        label: `${size}px`,
        type: 'radio',
        checked: windowConfig.size === size,
        click: () => setSize(size)
      }))
    },
    {
      label: '窗口形状',
      submenu: [
        {
          label: '⭕ 圆形',
          type: 'radio',
          checked: windowConfig.shape === 'circle',
          click: () => setShape('circle')
        },
        {
          label: '⬛ 方形',
          type: 'radio',
          checked: windowConfig.shape === 'square',
          click: () => setShape('square')
        },
        {
          label: '🔳 圆角方形',
          type: 'radio',
          checked: windowConfig.shape === 'rounded',
          click: () => setShape('rounded')
        }
      ]
    },
    {
      label: '透明度',
      submenu: [
        { label: '100%', type: 'radio', checked: windowConfig.opacity === 1.0, click: () => setOpacity(1.0) },
        { label: '80%', type: 'radio', checked: windowConfig.opacity === 0.8, click: () => setOpacity(0.8) },
        { label: '60%', type: 'radio', checked: windowConfig.opacity === 0.6, click: () => setOpacity(0.6) }
      ]
    },
    {
      label: '始终置顶',
      type: 'checkbox',
      checked: windowConfig.alwaysOnTop,
      click: (menuItem) => {
        windowConfig.alwaysOnTop = menuItem.checked;
        mainWindow?.setAlwaysOnTop(menuItem.checked);
        saveConfig();
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  );

  return Menu.buildFromTemplate(template);
}

function updateTrayMenu() {
  tray?.setContextMenu(buildContextMenu({ includeVisibilityToggle: true }));
}

function setShape(shape) {
  windowConfig.shape = shape;
  sendToRenderer('set-shape', shape);
  saveConfig();
  updateTrayMenu();
}

function setSize(size) {
  windowConfig.size = size;

  if (mainWindow) {
    mainWindow.setContentSize(size, size);
    sendToRenderer('set-size', size);
  }

  saveConfig();
  updateTrayMenu();
}

function setOpacity(opacity) {
  windowConfig.opacity = opacity;
  mainWindow?.setOpacity(opacity);
  saveConfig();
  updateTrayMenu();
}

function switchToCamera(deviceId = windowConfig.cameraDeviceId || '') {
  windowConfig.sourceMode = 'camera';
  windowConfig.cameraDeviceId = deviceId;
  saveConfig();
  updateTrayMenu();
  sendToRenderer('switch-source', 'camera', { deviceId });
}

function switchToVideo(filePaths) {
  const nextVideoList = (filePaths || []).filter((filePath) => fs.existsSync(filePath));

  if (nextVideoList.length === 0) {
    return false;
  }

  windowConfig.videoList = nextVideoList;
  windowConfig.sourceMode = 'video';
  saveConfig();
  updateTrayMenu();
  sendToRenderer('switch-source', 'video', nextVideoList);
  return true;
}

async function pickVideoFiles() {
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: '选择视频文件',
    filters: VIDEO_FILTERS,
    properties: ['openFile', 'multiSelections']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths.filter((filePath) => fs.existsSync(filePath));
}

async function pickAndSwitchToVideo() {
  const filePaths = await pickVideoFiles();

  if (!filePaths || filePaths.length === 0) {
    return null;
  }

  switchToVideo(filePaths);
  return filePaths;
}

function isTrustedSender(event) {
  return Boolean(mainWindow && event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame &&
    event.senderFrame.url === pathToFileURL(path.join(__dirname, 'index.html')).href);
}

ipcMain.on('show-context-menu', (event) => {
  if (!isTrustedSender(event)) return;
  if (!mainWindow) {
    return;
  }

  const menu = buildContextMenu();
  menu.popup({ window: mainWindow });
});

ipcMain.handle('request-camera-access', async (event) => {
  if (!isTrustedSender(event)) return { granted: false };
  return requestCameraAccess();
});

ipcMain.on('open-camera-settings', (event) => {
  if (!isTrustedSender(event)) return;
  openCameraSettings();
});

ipcMain.on('camera-devices-updated', (event, devices) => {
  if (!isTrustedSender(event)) return;
  cameraDevices = normalizeCameraDevices(devices);
  updateTrayMenu();
});

ipcMain.on('resize-window', (event, delta) => {
  if (!isTrustedSender(event) || !Number.isFinite(delta) || Math.abs(delta) > 100) return;
  const newSize = Math.max(100, Math.min(500, windowConfig.size + delta));

  if (newSize !== windowConfig.size) {
    setSize(newSize);
  }
});

ipcMain.on('drag-move', (event, deltaX, deltaY) => {
  if (!isTrustedSender(event) || !Number.isInteger(deltaX) || !Number.isInteger(deltaY)) return;
  if (!mainWindow) {
    return;
  }

  const [x, y] = mainWindow.getPosition();
  mainWindow.setPosition(x + deltaX, y + deltaY);
});

ipcMain.handle('get-config', (event) => {
  if (!isTrustedSender(event)) return null;
  return windowConfig;
});

app.whenReady().then(() => {
  loadConfig();
  configureMediaPermissions();
  createWindow();
  createTray();

});

app.on('second-instance', () => {
  showMainWindow();
});

app.on('window-all-closed', () => {
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  tray?.destroy();
});

function createTrayIcon() {
  const iconPath = path.join(__dirname, 'icon.png');
  return nativeImage.createFromPath(iconPath).resize({ width: 22, height: 22 });
}
