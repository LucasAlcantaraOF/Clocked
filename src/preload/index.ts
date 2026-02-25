import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  scheduleShutdown: (targetTime: string) => ipcRenderer.invoke('schedule-shutdown', targetTime),
  cancelShutdown: () => ipcRenderer.invoke('cancel-shutdown'),
  getScheduledTime: () => ipcRenderer.invoke('get-scheduled-time'),
  checkWindowsShutdown: () => ipcRenderer.invoke('check-windows-shutdown'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowMinimize: () => ipcRenderer.invoke('window-minimize')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

