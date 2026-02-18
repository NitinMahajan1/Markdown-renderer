const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, data) => callback(data)),
    onRecentFilesUpdated: (callback) => ipcRenderer.on('recent-files-updated', (event, data) => callback(data)),
    onActivateFileByPath: (callback) => ipcRenderer.on('activate-file-by-path', (event, path) => callback(path)),
    getPathForFile: (file) => webUtils.getPathForFile(file),
    signalReady: () => ipcRenderer.invoke('renderer-ready'),
    saveSession: (data) => ipcRenderer.invoke('save-session', data),
    getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
    clearRecentFiles: () => ipcRenderer.invoke('clear-recent-files'),
    openRecentFile: (filePath) => ipcRenderer.invoke('open-recent-file', filePath),
    restoreSession: () => ipcRenderer.invoke('restore-session')
});
