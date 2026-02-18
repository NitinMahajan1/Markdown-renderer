// Markdown Renderer — renderer process
// This file gets bundled by esbuild into renderer.bundle.js
const { marked } = require('marked');
const hljs = require('highlight.js');

// ─── Marked Configuration ──────────────────────────────────────
marked.setOptions({
    breaks: true,
    gfm: true
});

const renderer = new marked.Renderer();

renderer.image = function (token) {
    const href = token.href || '';
    const title = token.title || '';
    const text = token.text || '';
    return `<figure class="md-figure"><img src="${href}" alt="${text}" title="${title}" loading="lazy"><figcaption>${text}</figcaption></figure>`;
};

renderer.table = function (token) {
    let header = '';
    let body = '';
    if (token.header && token.header.length > 0) {
        const headerCells = token.header.map((cell, i) => {
            const align = token.align && token.align[i] ? ` style="text-align:${token.align[i]}"` : '';
            const content = cell.tokens ? this.parser.parseInline(cell.tokens) : cell.text;
            return `<th${align}>${content}</th>`;
        }).join('');
        header = `<thead><tr>${headerCells}</tr></thead>`;
    }
    if (token.rows && token.rows.length > 0) {
        const bodyRows = token.rows.map(row => {
            const cells = row.map((cell, i) => {
                const align = token.align && token.align[i] ? ` style="text-align:${token.align[i]}"` : '';
                const content = cell.tokens ? this.parser.parseInline(cell.tokens) : cell.text;
                return `<td${align}>${content}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');
        body = `<tbody>${bodyRows}</tbody>`;
    }
    return `<div class="table-wrapper"><table>${header}${body}</table></div>`;
};

renderer.code = function (token) {
    const code = token.text || '';
    const lang = (token.lang || '').trim();
    let highlighted;
    if (lang && hljs.getLanguage(lang)) {
        try { highlighted = hljs.highlight(code, { language: lang }).value; }
        catch (e) { highlighted = escapeHtml(code); }
    } else {
        try { highlighted = hljs.highlightAuto(code).value; }
        catch (e) { highlighted = escapeHtml(code); }
    }
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    return `<div class="code-block">${langLabel}<pre><code class="hljs${lang ? ` language-${lang}` : ''}">${highlighted}</code></pre></div>`;
};

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

marked.use({ renderer });

// ─── State ─────────────────────────────────────────────────────
const files = []; // { filePath, fileName, content }
let activeIndex = -1;
let recentFiles = []; // { filePath, fileName, dirName }
const collapsedFolders = new Set(); // persisted collapsed state

// ─── Helpers ───────────────────────────────────────────────────
function getFolderName(filePath) {
    const parts = filePath.split('/');
    if (parts.length >= 2) {
        return parts[parts.length - 2];
    }
    return '/';
}

function getFolderPath(filePath) {
    const idx = filePath.lastIndexOf('/');
    return idx > 0 ? filePath.substring(0, idx) : '/';
}

function groupFilesByFolder(filesList) {
    const groups = new Map(); // folderPath -> { folderName, files: [{index, file}] }
    filesList.forEach((file, index) => {
        const folderPath = getFolderPath(file.filePath);
        const folderName = getFolderName(file.filePath);
        if (!groups.has(folderPath)) {
            groups.set(folderPath, { folderName, folderPath, files: [] });
        }
        groups.get(folderPath).files.push({ index, file });
    });
    return Array.from(groups.values());
}

// ─── Wait for DOM ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const fileListEl = document.getElementById('file-list');
    const recentListEl = document.getElementById('recent-list');
    const openSection = document.getElementById('open-files-section');
    const recentSection = document.getElementById('recent-files-section');
    const emptyState = document.getElementById('empty-state');
    const markdownBody = document.getElementById('markdown-body');
    const toolbarFilename = document.getElementById('toolbar-filename');
    const dragOverlay = document.getElementById('drag-overlay');
    const btnOpenFile = document.getElementById('btn-open-file');
    const btnOpenEmpty = document.getElementById('btn-open-empty');
    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    const btnSidebarToggle = document.getElementById('btn-toggle-sidebar');
    const btnSidebarMobile = document.getElementById('btn-sidebar-toggle-mobile');
    const btnClearRecent = document.getElementById('btn-clear-recent');
    const btnRestoreSession = document.getElementById('btn-restore-session');

    // ─── Theme ───────────────────────────────────────────────────
    let currentTheme = localStorage.getItem('md-theme') || 'dark';
    applyTheme(currentTheme);

    function applyTheme(theme) {
        document.body.classList.remove('theme-dark', 'theme-light');
        document.body.classList.add(`theme-${theme}`);
        const iconMoon = btnThemeToggle.querySelector('.icon-moon');
        const iconSun = btnThemeToggle.querySelector('.icon-sun');
        if (theme === 'dark') {
            iconMoon.style.display = 'block';
            iconSun.style.display = 'none';
        } else {
            iconMoon.style.display = 'none';
            iconSun.style.display = 'block';
        }
        localStorage.setItem('md-theme', theme);
    }

    btnThemeToggle.addEventListener('click', () => {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(currentTheme);
    });

    // ─── Sidebar Toggle ──────────────────────────────────────────
    btnSidebarToggle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
    btnSidebarMobile.addEventListener('click', () => sidebar.classList.toggle('collapsed'));

    // ─── Open File Buttons ────────────────────────────────────────
    btnOpenFile.addEventListener('click', () => window.electronAPI.openFileDialog());
    btnOpenEmpty.addEventListener('click', () => window.electronAPI.openFileDialog());

    // ─── Restore Session ─────────────────────────────────────────
    btnRestoreSession.addEventListener('click', () => {
        window.electronAPI.restoreSession();
    });

    // ─── Clear Recent ─────────────────────────────────────────────
    btnClearRecent.addEventListener('click', () => {
        recentFiles = [];
        window.electronAPI.clearRecentFiles();
        refreshRecentList();
    });

    // ─── Receive opened files from Main Process ──────────────────
    window.electronAPI.onFileOpened((data) => {
        // Handle special activate message
        if (data.__activateFile) {
            const idx = files.findIndex(f => f.filePath === data.__activateFile);
            if (idx !== -1) activateFile(idx);
            return;
        }
        console.log('File received from main process:', data.fileName);
        addFile(data);
    });

    // ─── Receive recent files updates ────────────────────────────
    window.electronAPI.onRecentFilesUpdated((data) => {
        recentFiles = data;
        refreshRecentList();
    });

    // ─── Activate file by path (for session restore) ─────────────
    window.electronAPI.onActivateFileByPath((filePath) => {
        const idx = files.findIndex(f => f.filePath === filePath);
        if (idx !== -1) activateFile(idx);
    });

    // ─── Save session before window closes ────────────────────────
    window.addEventListener('beforeunload', () => {
        const openFilePaths = files.map(f => f.filePath);
        const activeFile = activeIndex >= 0 ? files[activeIndex].filePath : null;
        window.electronAPI.saveSession({ openFiles: openFilePaths, activeFile });
    });

    // ─── File Management ─────────────────────────────────────────
    function addFile({ filePath, fileName, content }) {
        console.log('addFile called:', fileName, 'content length:', content.length);
        const existingIndex = files.findIndex(f => f.filePath === filePath);
        if (existingIndex !== -1) {
            files[existingIndex].content = content;
            activateFile(existingIndex);
            return;
        }
        files.push({ filePath, fileName, content });
        activateFile(files.length - 1);
        refreshFileList();
    }

    function activateFile(index) {
        activeIndex = index;
        const file = files[index];
        console.log('Activating file:', file.fileName);

        try {
            const html = marked.parse(file.content);
            markdownBody.innerHTML = html;
        } catch (err) {
            console.error('Markdown parse error:', err);
            markdownBody.innerHTML = `<pre style="color:red;">Error rendering markdown: ${err.message}</pre>`;
        }

        markdownBody.style.display = 'block';
        emptyState.style.display = 'none';

        toolbarFilename.textContent = file.fileName;
        document.title = `${file.fileName} — Markdown Renderer`;

        document.getElementById('render-area').scrollTop = 0;
        refreshFileList();
    }

    function closeFile(index) {
        files.splice(index, 1);
        if (files.length === 0) {
            activeIndex = -1;
            markdownBody.style.display = 'none';
            emptyState.style.display = 'flex';
            toolbarFilename.textContent = 'No file open';
            document.title = 'Markdown Renderer';
        } else if (index <= activeIndex) {
            activateFile(Math.max(0, activeIndex - 1));
        }
        refreshFileList();
    }

    // ─── Sidebar: Grouped Open Files ─────────────────────────────
    function refreshFileList() {
        fileListEl.innerHTML = '';

        if (files.length === 0) {
            openSection.style.display = 'none';
            return;
        }
        openSection.style.display = 'block';

        const groups = groupFilesByFolder(files);

        // If only one folder, show flat list
        if (groups.length === 1) {
            groups[0].files.forEach(({ index, file }) => {
                fileListEl.appendChild(createFileItem(index, file));
            });
            return;
        }

        // Multiple folders — show grouped
        groups.forEach(group => {
            const folderEl = document.createElement('div');
            folderEl.className = 'folder-group';

            const isCollapsed = collapsedFolders.has(group.folderPath);

            // Folder header
            const headerEl = document.createElement('div');
            headerEl.className = `folder-header${isCollapsed ? ' collapsed' : ''}`;
            headerEl.innerHTML = `
        <svg class="folder-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        <svg class="folder-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <span class="folder-name" title="${group.folderPath}">${group.folderName}</span>
        <span class="folder-count">${group.files.length}</span>
      `;
            headerEl.addEventListener('click', () => {
                if (collapsedFolders.has(group.folderPath)) {
                    collapsedFolders.delete(group.folderPath);
                } else {
                    collapsedFolders.add(group.folderPath);
                }
                refreshFileList();
            });
            folderEl.appendChild(headerEl);

            // Files within folder
            if (!isCollapsed) {
                const filesContainer = document.createElement('div');
                filesContainer.className = 'folder-files';
                group.files.forEach(({ index, file }) => {
                    filesContainer.appendChild(createFileItem(index, file));
                });
                folderEl.appendChild(filesContainer);
            }

            fileListEl.appendChild(folderEl);
        });
    }

    function createFileItem(index, file) {
        const li = document.createElement('div');
        li.className = `file-item${index === activeIndex ? ' active' : ''}`;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-name';
        nameSpan.textContent = file.fileName;
        nameSpan.title = file.filePath;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'file-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.title = 'Close file';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeFile(index);
        });

        li.appendChild(nameSpan);
        li.appendChild(closeBtn);
        li.addEventListener('click', () => activateFile(index));
        return li;
    }

    // ─── Sidebar: Recent Files ───────────────────────────────────
    function refreshRecentList() {
        recentListEl.innerHTML = '';

        // Filter out files that are currently open
        const openPaths = new Set(files.map(f => f.filePath));
        const filtered = recentFiles.filter(r => !openPaths.has(r.filePath));

        if (filtered.length === 0) {
            recentSection.style.display = 'none';
            return;
        }
        recentSection.style.display = 'block';

        filtered.slice(0, 10).forEach(recent => {
            const li = document.createElement('li');
            li.className = 'recent-item';
            li.title = recent.filePath;
            li.innerHTML = `
        <span class="recent-name">${recent.fileName}</span>
        <span class="recent-dir">${recent.dirName ? recent.dirName.split('/').pop() : ''}</span>
      `;
            li.addEventListener('click', () => {
                window.electronAPI.openRecentFile(recent.filePath);
            });
            recentListEl.appendChild(li);
        });
    }

    // ─── Drag and Drop ───────────────────────────────────────────
    let dragCounter = 0;

    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        dragOverlay.classList.add('visible');
    });

    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            dragOverlay.classList.remove('visible');
        }
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    document.addEventListener('drop', async (e) => {
        e.preventDefault();
        dragCounter = 0;
        dragOverlay.classList.remove('visible');

        const droppedFiles = e.dataTransfer.files;
        for (const file of droppedFiles) {
            try {
                const filePath = window.electronAPI.getPathForFile(file);
                if (filePath) {
                    const result = await window.electronAPI.readFile(filePath);
                    if (result.success) {
                        addFile({
                            filePath: result.filePath,
                            fileName: result.fileName,
                            content: result.content
                        });
                    }
                }
            } catch (err) {
                console.error('Error handling dropped file:', err);
            }
        }
    });

    console.log('Markdown Renderer initialized successfully');

    // Tell the main process we're ready to receive files
    window.electronAPI.signalReady();
});
