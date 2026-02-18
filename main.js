const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let recentFiles = [];
let pendingFiles = []; // Files to open once the renderer is ready
let rendererReady = false;

// ─── Persistence Paths ─────────────────────────────────────────
const userDataPath = app.getPath('userData');
const sessionFile = path.join(userDataPath, 'session.json');
const recentFile = path.join(userDataPath, 'recent-files.json');

// ─── Session & Recent Files Persistence ────────────────────────
function loadSession() {
  try {
    if (fs.existsSync(sessionFile)) {
      const data = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
      return data;
    }
  } catch (err) {
    console.error('[main] Failed to load session:', err.message);
  }
  return null;
}

function saveSession(openFilePaths, activeFilePath) {
  try {
    // Only save paths that still exist
    const validPaths = openFilePaths.filter(p => fs.existsSync(p));
    fs.writeFileSync(sessionFile, JSON.stringify({
      openFiles: validPaths,
      activeFile: activeFilePath,
      timestamp: Date.now()
    }, null, 2));
    console.log('[main] Session saved:', validPaths.length, 'files');
  } catch (err) {
    console.error('[main] Failed to save session:', err.message);
  }
}

function loadRecentFiles() {
  try {
    if (fs.existsSync(recentFile)) {
      const data = JSON.parse(fs.readFileSync(recentFile, 'utf-8'));
      // Filter out files that no longer exist
      recentFiles = (data.files || []).filter(f => fs.existsSync(f));
      return;
    }
  } catch (err) {
    console.error('[main] Failed to load recent files:', err.message);
  }
  recentFiles = [];
}

function saveRecentFiles() {
  try {
    fs.writeFileSync(recentFile, JSON.stringify({ files: recentFiles }, null, 2));
  } catch (err) {
    console.error('[main] Failed to save recent files:', err.message);
  }
}

function addToRecent(filePath) {
  recentFiles = recentFiles.filter(f => f !== filePath);
  recentFiles.unshift(filePath);
  if (recentFiles.length > 20) recentFiles = recentFiles.slice(0, 20);
  saveRecentFiles();
}

// ─── Window ────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
  });
}

// ─── Menu ──────────────────────────────────────────────────────
function buildMenu() {
  const recentSubmenu = recentFiles.length > 0
    ? [
      ...recentFiles.slice(0, 10).map(f => ({
        label: path.basename(f),
        sublabel: path.dirname(f),
        click: () => sendFileToRenderer(f)
      })),
      { type: 'separator' },
      {
        label: 'Clear Recent Files',
        click: () => {
          recentFiles = [];
          saveRecentFiles();
          buildMenu();
          if (rendererReady && mainWindow) {
            mainWindow.webContents.send('recent-files-updated', []);
          }
        }
      }
    ]
    : [{ label: 'No Recent Files', enabled: false }];

  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open File…',
          accelerator: 'CmdOrCtrl+O',
          click: () => openFile()
        },
        {
          label: 'Open Recent',
          submenu: recentSubmenu
        },
        { type: 'separator' },
        {
          label: 'Restore Previous Session',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => restoreSession()
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─── File Operations ───────────────────────────────────────────
async function openFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkdn', 'mkd'] },
      { name: 'Text', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    for (const filePath of result.filePaths) {
      sendFileToRenderer(filePath);
    }
  }
}

function sendFileToRenderer(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    // Track recent files
    addToRecent(filePath);
    buildMenu();

    // Send updated recent files to renderer
    if (rendererReady && mainWindow) {
      mainWindow.webContents.send('recent-files-updated', recentFiles.map(f => ({
        filePath: f,
        fileName: path.basename(f),
        dirName: path.dirname(f)
      })));
    }

    const fileData = { filePath, fileName, content };

    if (rendererReady && mainWindow) {
      console.log('[main] Sending file to renderer:', fileName);
      mainWindow.webContents.send('file-opened', fileData);
    } else {
      console.log('[main] Renderer not ready, queuing file:', fileName);
      pendingFiles.push(fileData);
    }
  } catch (err) {
    console.error('[main] Failed to read file:', err.message);
    dialog.showErrorBox('Error', `Failed to open file: ${err.message}`);
  }
}

function flushPendingFiles() {
  if (pendingFiles.length > 0 && mainWindow) {
    console.log('[main] Flushing', pendingFiles.length, 'pending files');
    for (const fileData of pendingFiles) {
      mainWindow.webContents.send('file-opened', fileData);
    }
    pendingFiles = [];
  }
}

function restoreSession() {
  const session = loadSession();
  if (session && session.openFiles && session.openFiles.length > 0) {
    console.log('[main] Restoring session with', session.openFiles.length, 'files');
    for (const filePath of session.openFiles) {
      sendFileToRenderer(filePath);
    }
    // Activate the previously active file
    if (session.activeFile && rendererReady && mainWindow) {
      mainWindow.webContents.send('activate-file-by-path', session.activeFile);
    }
  } else {
    console.log('[main] No previous session to restore');
  }
}

// ─── IPC Handlers ──────────────────────────────────────────────
ipcMain.handle('open-file-dialog', async () => {
  await openFile();
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content, fileName: path.basename(filePath), filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('renderer-ready', () => {
  console.log('[main] Renderer reports ready');
  rendererReady = true;
  flushPendingFiles();

  // Send recent files list to renderer
  if (mainWindow) {
    mainWindow.webContents.send('recent-files-updated', recentFiles.map(f => ({
      filePath: f,
      fileName: path.basename(f),
      dirName: path.dirname(f)
    })));
  }
});

// Renderer saves its session state before the window closes
ipcMain.handle('save-session', (event, sessionData) => {
  saveSession(sessionData.openFiles, sessionData.activeFile);
});

ipcMain.handle('get-recent-files', () => {
  return recentFiles.map(f => ({
    filePath: f,
    fileName: path.basename(f),
    dirName: path.dirname(f)
  }));
});

ipcMain.handle('clear-recent-files', () => {
  recentFiles = [];
  saveRecentFiles();
  buildMenu();
});

ipcMain.handle('open-recent-file', async (event, filePath) => {
  sendFileToRenderer(filePath);
});

ipcMain.handle('restore-session', () => {
  restoreSession();
});

// ─── App Lifecycle ─────────────────────────────────────────────
app.whenReady().then(() => {
  loadRecentFiles();
  createWindow();
  buildMenu();

  // Check for a previous session — auto-restore if no CLI files specified
  const args = process.argv.slice(1).filter(arg => !arg.startsWith('-'));
  const cliFiles = [];
  for (const arg of args) {
    const resolved = path.resolve(arg);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      cliFiles.push(resolved);
    }
  }

  if (cliFiles.length > 0) {
    // Open files from command line
    for (const filePath of cliFiles) {
      console.log('[main] Opening file from command line:', filePath);
      sendFileToRenderer(filePath);
    }
  } else {
    // Auto-restore previous session
    const session = loadSession();
    if (session && session.openFiles && session.openFiles.length > 0) {
      console.log('[main] Auto-restoring previous session');
      for (const filePath of session.openFiles) {
        if (fs.existsSync(filePath)) {
          sendFileToRenderer(filePath);
        }
      }
      // We'll send the active file path once the renderer is ready
      if (session.activeFile) {
        const originalFlush = flushPendingFiles;
        const activeFile = session.activeFile;
        // Override to also activate the right file after flushing
        const origRendererReady = ipcMain.removeHandler ? null : null;
        // Use a simpler approach: queue a message
        pendingFiles.push({ __activateFile: activeFile });
      }
    }
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle file open from Finder / macOS file association
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  console.log('[main] open-file event:', filePath);
  if (mainWindow) {
    sendFileToRenderer(filePath);
  } else {
    pendingFiles.push(null);
    app.whenReady().then(() => {
      pendingFiles = pendingFiles.filter(f => f !== null);
      sendFileToRenderer(filePath);
    });
  }
});

// Save session before quit
app.on('before-quit', () => {
  // If the renderer hasn't sent session data, we can't save
  // The renderer should have sent it during 'close' event
  console.log('[main] App quitting');
});
