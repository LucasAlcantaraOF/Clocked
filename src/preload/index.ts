import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // Sistema de Events
  createEvent: (eventData: any) => ipcRenderer.invoke('create-event', eventData),
  updateEvent: (eventId: string, eventData: any) => ipcRenderer.invoke('update-event', eventId, eventData),
  cancelEvent: (eventId: string) => ipcRenderer.invoke('cancel-event', eventId),
  getEvent: (eventId: string) => ipcRenderer.invoke('get-event', eventId),
  getAllEvents: () => ipcRenderer.invoke('get-all-events'),
  deleteEvent: (eventId: string) => ipcRenderer.invoke('delete-event', eventId),
  
  // Compatibilidade (mantido para código antigo)
  scheduleShutdown: (targetTime: string) => ipcRenderer.invoke('schedule-shutdown', targetTime),
  cancelShutdown: () => ipcRenderer.invoke('cancel-shutdown'),
  getScheduledTime: () => ipcRenderer.invoke('get-scheduled-time'),
  checkWindowsShutdown: () => ipcRenderer.invoke('check-windows-shutdown'),
  
  // Window controls
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowCloseConfirm: () => ipcRenderer.invoke('window-close-confirm'),
  windowMinimizeToTray: () => ipcRenderer.invoke('window-minimize-to-tray'),
  windowRestore: () => ipcRenderer.invoke('window-restore'),
  
  // Alarm control
  stopAlarm: (actionId: string) => ipcRenderer.invoke('stop-alarm', actionId),
  
  // IPC listeners
  onAlarmTriggered: (callback: (data: { actionId: string; title: string }) => void) => {
    ipcRenderer.on('alarm-triggered', (_event, data) => callback(data))
  },
  onAlarmStopped: (callback: (data: { actionId: string }) => void) => {
    ipcRenderer.on('alarm-stopped', (_event, data) => callback(data))
  },
  removeAlarmListeners: () => {
    ipcRenderer.removeAllListeners('alarm-triggered')
    ipcRenderer.removeAllListeners('alarm-stopped')
  }
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

