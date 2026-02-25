import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      scheduleShutdown: (targetTime: string) => Promise<{ success: boolean; message: string }>
      cancelShutdown: () => Promise<{ success: boolean; message: string }>
      getScheduledTime: () => Promise<string | null>
      checkWindowsShutdown: () => Promise<{ scheduled: boolean; message: string }>
      windowClose: () => Promise<void>
      windowMinimize: () => Promise<void>
    }
  }
}

