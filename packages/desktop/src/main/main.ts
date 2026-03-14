import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { ChatService } from './services/chat-service.js';
import { setupIpcHandlers, type AppState } from './ipc.js';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const appState: AppState = {
  mainWindow: null,
  chatService: null,
  chatServiceInitialized: false,
  sessionService: null,
  isInitialized: false,
  currentCwd: null,
};

const createWindow = () => {
  // Create the browser window.
  appState.mainWindow = new BrowserWindow({
    minWidth: 1200,
    minHeight: 1000,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // 隐藏菜单栏
  Menu.setApplicationMenu(null);

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    appState.mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    appState.mainWindow.webContents.openDevTools();
  } else {
    appState.mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

app.whenReady().then(async () => {
  setupIpcHandlers(appState);
  createWindow();

  appState.chatService = new ChatService((event) => {
    appState.mainWindow?.webContents.send('chat:stream-event', event);
  });

  // 不再在启动时自动初始化和认证，由渲染器通过 IPC 触发
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', async () => {
  if (appState.chatService) {
    await appState.chatService.shutdown();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
