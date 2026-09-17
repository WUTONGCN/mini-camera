const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('buildMediaFileUrl encodes Windows file paths safely', () => {
  const { buildMediaFileUrl } = require('../media-path');

  assert.equal(
    buildMediaFileUrl('C:\\Users\\Example\\Desktop\\test video#1.mp4'),
    'file:///C:/Users/Example/Desktop/test%20video%231.mp4'
  );
});

test('packaging includes the isolated runtime and camera entitlement', () => {
  const packageJson = JSON.parse(readProjectFile('package.json'));
  for (const file of ['main.js', 'preload.js', 'config.js', 'renderer.js', 'index.html', 'media-path.js', 'window-behavior.js', 'styles.css', 'icon.ico', 'icon.png', 'LICENSE']) {
    assert.ok(packageJson.build.files.includes(file));
    assert.ok(fs.existsSync(path.join(projectRoot, file)));
  }
  assert.equal(packageJson.build.mac.entitlements, 'entitlements.mac.plist');
  assert.match(packageJson.build.mac.extendInfo.NSCameraUsageDescription, /摄像头/);
});

test('local video element does not force loop mode in markup', () => {
  const indexHtml = readProjectFile('index.html');

  assert.doesNotMatch(indexHtml, /<video id="video"[^>]*\sloop\b/);
});

test('always-on-top toggle persists to config', () => {
  const mainJs = readProjectFile('main.js');
  const start = mainJs.indexOf("label: '始终置顶'");
  const end = mainJs.indexOf("{ type: 'separator' }", start);
  const menuBlock = mainJs.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(menuBlock, /windowConfig\.alwaysOnTop = menuItem\.checked;/);
  assert.match(menuBlock, /mainWindow\?\.setAlwaysOnTop\(menuItem\.checked\);/);
  assert.match(menuBlock, /saveConfig\(\);/);
});

test('window behavior cycles preset sizes and normalizes non-preset values', () => {
  const {
    SIZE_PRESETS,
    getNextPresetSize
  } = require('../window-behavior');

  assert.deepEqual(SIZE_PRESETS, [150, 200, 300, 400]);
  assert.equal(getNextPresetSize(150), 200);
  assert.equal(getNextPresetSize(200), 300);
  assert.equal(getNextPresetSize(400), 150);
  assert.equal(getNextPresetSize(180), 200);
  assert.equal(getNextPresetSize(420), 150);
});

test('window behavior resolves source toggle without guessing', () => {
  const { resolveSourceToggle } = require('../window-behavior');

  assert.deepEqual(
    resolveSourceToggle({ sourceMode: 'camera', videoList: ['C:\\demo.mp4'] }),
    { kind: 'switch-to-video', videoList: ['C:\\demo.mp4'] }
  );

  assert.deepEqual(
    resolveSourceToggle({ sourceMode: 'camera', videoList: [] }),
    { kind: 'pick-video' }
  );

  assert.deepEqual(
    resolveSourceToggle({ sourceMode: 'video', videoList: ['C:\\demo.mp4'] }),
    { kind: 'switch-to-camera' }
  );
});

test('main process defaults to a small circular camera and exposes right-click controls', () => {
  const mainJs = readProjectFile('main.js');

  assert.match(mainJs, /size:\s*150/);
  assert.match(mainJs, /shape:\s*'circle'/);
  assert.match(mainJs, /cameraDeviceId:\s*''/);
  assert.match(mainJs, /label:\s*'隐藏窗口'/);
  assert.match(mainJs, /label:\s*'窗口大小'/);
  assert.match(mainJs, /SIZE_PRESETS\.map/);
  assert.match(mainJs, /menu\.popup\(\{\s*window:\s*mainWindow\s*\}\)/);
  assert.doesNotMatch(mainJs, /tray\?\.(popUpContextMenu|popupContextMenu)/);
});

test('main process requests and grants camera media permissions for the camera window', () => {
  const mainJs = readProjectFile('main.js');

  assert.match(mainJs, /setPermissionRequestHandler/);
  assert.match(mainJs, /permission !== 'media'/);
  assert.match(mainJs, /details\.mediaTypes/);
  assert.match(mainJs, /askForMediaAccess\('camera'\)/);
  assert.match(mainJs, /ipcMain\.handle\('request-camera-access'/);
  assert.match(mainJs, /ipcMain\.on\('camera-devices-updated'/);
  assert.match(mainJs, /label:\s*'系统默认摄像头'/);
  assert.match(mainJs, /label:\s*'刷新摄像头列表'/);
  assert.match(mainJs, /x-apple\.systempreferences:com\.apple\.preference\.security\?Privacy_Camera/);
});

test('main window markup keeps operations out of the camera surface', () => {
  const indexHtml = readProjectFile('index.html');

  assert.match(indexHtml, /class="shape-circle"/);
  assert.doesNotMatch(indexHtml, /id="mode-badge"/);
  assert.doesNotMatch(indexHtml, /id="hover-controls"/);
  assert.doesNotMatch(indexHtml, /id="mode-toggle-btn"/);
  assert.doesNotMatch(indexHtml, /id="size-cycle-btn"/);
  assert.doesNotMatch(indexHtml, /id="more-btn"/);
  assert.doesNotMatch(indexHtml, /id="hide-btn"/);
  assert.match(indexHtml, /id="status-strip"/);
});

test('renderer opens settings from right-click without in-surface controls', () => {
  const rendererJs = readProjectFile('renderer.js');

  assert.match(rendererJs, /contextmenu/);
  assert.match(rendererJs, /ipcRenderer\.send\('show-context-menu'\)/);
  assert.match(rendererJs, /addEventListener\('wheel'/);
  assert.match(rendererJs, /ipcRenderer\.send\('resize-window', delta\)/);
  assert.doesNotMatch(rendererJs, /modeToggleBtn/);
  assert.doesNotMatch(rendererJs, /sizeCycleBtn/);
  assert.doesNotMatch(rendererJs, /moreBtn/);
  assert.doesNotMatch(rendererJs, /hideBtn/);
  assert.doesNotMatch(rendererJs, /ipcRenderer\.invoke\('toggle-source'\)/);
  assert.doesNotMatch(rendererJs, /ipcRenderer\.send\('cycle-size'\)/);
  assert.match(rendererJs, /showStatus\([^)]*'success'/);
});

test('main process supports wheel resizing without restoring in-surface buttons', () => {
  const mainJs = readProjectFile('main.js');

  assert.match(mainJs, /ipcMain\.on\('resize-window'/);
  assert.match(mainJs, /Math\.max\(100, Math\.min\(500, windowConfig\.size \+ delta\)\)/);
  assert.match(mainJs, /setSize\(newSize\)/);
});

test('renderer starts camera playback and surfaces permission or device failures', () => {
  const rendererJs = readProjectFile('renderer.js');

  assert.match(rendererJs, /ipcRenderer\.invoke\('request-camera-access'\)/);
  assert.match(rendererJs, /selectedCameraDeviceId/);
  assert.match(rendererJs, /video\.deviceId = \{\s*exact:\s*selectedCameraDeviceId\s*\}/);
  assert.match(rendererJs, /enumerateDevices\(\)/);
  assert.match(rendererJs, /ipcRenderer\.send\('camera-devices-updated'/);
  assert.match(rendererJs, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(rendererJs, /await cameraVideo\.play\(\)/);
  assert.match(rendererJs, /摄像头权限/);
  assert.match(rendererJs, /摄像头被占用/);
  assert.match(rendererJs, /未检测到摄像头/);
  assert.match(rendererJs, /所选摄像头不可用/);
});

test('main process no longer bootstraps deprecated remote module', () => {
  const mainJs = readProjectFile('main.js');

  assert.doesNotMatch(mainJs, /@electron\/remote\/main/);
  assert.doesNotMatch(mainJs, /remoteMain\.initialize/);
  assert.doesNotMatch(mainJs, /remoteMain\.enable/);
  assert.doesNotMatch(mainJs, /enableRemoteModule/);
});

test('launcher clears ELECTRON_RUN_AS_NODE from inherited environment', () => {
  const { buildLaunchEnv, buildLaunchArgs } = require('../launch');

  const nextEnv = buildLaunchEnv({
    ELECTRON_RUN_AS_NODE: '1',
    MINI_CAMERA_TEST: 'ok'
  });

  assert.equal(nextEnv.MINI_CAMERA_TEST, 'ok');
  assert.equal('ELECTRON_RUN_AS_NODE' in nextEnv, false);
  assert.deepEqual(buildLaunchArgs(['--dev']), ['.', '--dev']);
});

test('package start scripts route through the launcher helper', () => {
  const packageJson = JSON.parse(readProjectFile('package.json'));

  assert.equal(packageJson.scripts?.start, 'node launch.js');
  assert.equal(packageJson.scripts?.dev, 'node launch.js --dev');
});

test('main process hardens transparent window startup for Windows compatibility', () => {
  const mainJs = readProjectFile('main.js');

  assert.match(mainJs, /process\.platform === 'win32'[\s\S]*app\.disableHardwareAcceleration\(\)/);
  assert.match(mainJs, /show:\s*false/);
  assert.match(mainJs, /mainWindow\.once\('ready-to-show'/);
});

test('transparent window styles avoid backdrop blur that can hide the card on Windows', () => {
  const stylesCss = readProjectFile('styles.css');

  assert.doesNotMatch(stylesCss, /backdrop-filter/);
});

test('main process keeps a single instance and reveals the existing window on relaunch', () => {
  const mainJs = readProjectFile('main.js');

  assert.match(mainJs, /app\.requestSingleInstanceLock\(\)/);
  assert.match(mainJs, /app\.on\('second-instance'/);
  assert.match(mainJs, /mainWindow\.restore\(\)/);
  assert.match(mainJs, /mainWindow\.show\(\)/);
  assert.match(mainJs, /mainWindow\.focus\(\)/);
});

test('configuration clamps invalid values and excludes old authorization data', () => {
  const { normalizeConfig } = require('../config');
  const defaults = {size: 150, shape: 'circle', opacity: 1, alwaysOnTop: true, sourceMode: 'camera', cameraDeviceId: '', videoList: [], defaultsVersion: 3};
  const config = normalizeConfig({size: 900, shape: 'invalid', opacity: -1, alwaysOnTop: 'yes', videoList: ['exists.mp4', 'missing.mp4', null], defaultsVersion: 3, license_key: 'private', machineCode: 'private'}, defaults, name => name === 'exists.mp4');
  assert.deepEqual(config, {...defaults, size: 500, opacity: 0.2, videoList: ['exists.mp4']});
  assert.deepEqual(normalizeConfig(null, defaults, () => false), defaults);
  assert.deepEqual(normalizeConfig({videoList: 'invalid'}, defaults, () => false), defaults);
});

test('preload limits IPC and never exposes the Electron event', () => {
  const vm = require('node:vm');
  let bridge;
  const sent = [];
  const handlers = {};
  const electron = {
    contextBridge: {exposeInMainWorld: (_name, api) => {bridge = api;}},
    ipcRenderer: {send: (...args) => sent.push(args), invoke: (...args) => Promise.resolve(args), on: (name, cb) => {handlers[name] = cb;}}
  };
  vm.runInNewContext(readProjectFile('preload.js'), {require: name => name === 'electron' ? electron : require('../media-path')});
  bridge.ipc.send('unknown-channel', 'secret');
  bridge.ipc.send('resize-window', 20);
  assert.deepEqual(sent, [['resize-window', 20]]);
  let received;
  bridge.ipc.on('set-size', (...args) => {received = args;});
  handlers['set-size']({sender: 'must-not-leak'}, 200);
  assert.deepEqual(received, [null, 200]);
});
