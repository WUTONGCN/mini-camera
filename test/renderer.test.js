const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function rendererHarness() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {classList: {add() {}, remove() {}}, dataset: {}, addEventListener() {}, setAttribute() {}, removeAttribute() {}, pause() {}, load() {}, play: () => Promise.resolve()});
    return elements.get(id);
  };
  const context = vm.createContext({
    window: {miniCamera: {ipc: {invoke: async () => ({granted: true}), send() {}, on() {}}, buildMediaFileUrl: name => 'file:///' + name}, addEventListener() {}},
    document: {getElementById: element, addEventListener() {}},
    navigator: {mediaDevices: {getUserMedia: async () => {throw new Error('Supply a fake stream');}, enumerateDevices: async () => []}},
    console: {error() {}}, setTimeout, clearTimeout
  });
  const source = fs.readFileSync(require.resolve('../renderer.js'), 'utf8').replace(/\ninit\(\);\s*$/, '');
  vm.runInContext(source, context);
  return {context, element};
}

test('late camera acquisition is stopped after switching to a video source', async () => {
  const {context, element} = rendererHarness();
  let deliver;
  let stopped = 0;
  context.navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {deliver = resolve;});
  const pending = vm.runInContext('startCamera()', context);
  await new Promise(resolve => setImmediate(resolve));
  vm.runInContext("playVideoList(['clip.mp4'])", context);
  deliver({getTracks: () => [{stop: () => {stopped++;}}]});
  assert.equal(await pending, false);
  assert.equal(stopped, 1);
  assert.equal(element('camera').srcObject, null);
  assert.equal(vm.runInContext('currentSource', context), 'video');
});

test('a playlist containing only broken videos stops after one pass', async () => {
  const {context, element} = rendererHarness();
  let attempts = 0;
  element('video').play = () => {attempts++; return Promise.reject(new Error('Unsupported format'));};
  vm.runInContext("playVideoList(['bad-1.mp4', 'bad-2.mp4'])", context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(attempts, 2);
  assert.equal(element('placeholder-title').textContent, '视频暂时无法播放');
});
