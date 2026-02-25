import { ElectronAPI } from '@electron-toolkit/preload'

export interface ClockedEvent {
  id: string
  title: string
  time: string
  date?: string
  repeat?: number
  actions: Array<{ id: string; type: string; params?: Record<string, any> }>
  createdAt: Date
  targetDateTime?: Date
  completed?: boolean
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      // Sistema de Events
      createEvent: (eventData: Omit<ClockedEvent, 'id' | 'createdAt'>) => Promise<{ success: boolean; event?: ClockedEvent; message: string }>
      updateEvent: (eventId: string, eventData: Omit<ClockedEvent, 'id' | 'createdAt'>) => Promise<{ success: boolean; event?: ClockedEvent; message: string }>
      cancelEvent: (eventId: string) => Promise<{ success: boolean; message: string }>
      getEvent: (eventId: string) => Promise<ClockedEvent | undefined>
      getAllEvents: () => Promise<ClockedEvent[]>
      deleteEvent: (eventId: string) => Promise<{ success: boolean; message: string }>
      
      // Compatibilidade (mantido para código antigo)
      scheduleShutdown: (targetTime: string) => Promise<{ success: boolean; message: string }>
      cancelShutdown: () => Promise<{ success: boolean; message: string }>
      getScheduledTime: () => Promise<string | null>
      checkWindowsShutdown: () => Promise<{ scheduled: boolean; message: string }>
      
      // Window controls
      windowClose: () => Promise<void>
      windowMinimize: () => Promise<void>
      windowCloseConfirm: () => Promise<void>
      windowMinimizeToTray: () => Promise<void>
      windowRestore: () => Promise<void>
      
      // Alarm control
      stopAlarm: (actionId: string) => Promise<{ success: boolean; message: string }>
      onAlarmTriggered: (callback: (data: { actionId: string; title: string; alarmPath?: string }) => void) => void
      onAlarmStopped: (callback: (data: { actionId: string }) => void) => void
      removeAlarmListeners: () => void
    }
  }
}

