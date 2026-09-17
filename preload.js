const { contextBridge, ipcRenderer } = require('electron');
const { buildMediaFileUrl } = require('./media-path');

const sendChannels = new Set(['show-context-menu', 'open-camera-settings', 'camera-devices-updated', 'resize-window', 'drag-move']);
const invokeChannels = new Set(['get-config', 'request-camera-access']);
const receiveChannels = new Set(['switch-source', 'set-shape', 'set-size', 'refresh-camera-devices']);

contextBridge.exposeInMainWorld('miniCamera', {
  buildMediaFileUrl,
  ipc: {
    send(channel, ...args) {
      if (sendChannels.has(channel)) ipcRenderer.send(channel, ...args);
    },
    invoke(channel, ...args) {
      if (!invokeChannels.has(channel)) return Promise.reject(new Error('Unsupported operation'));
      return ipcRenderer.invoke(channel, ...args);
    },
    on(channel, callback) {
      if (!receiveChannels.has(channel)) return;
      // Do not expose the Electron event or its sender to the page.
      ipcRenderer.on(channel, (_event, ...args) => callback(null, ...args));
    }
  }
});
