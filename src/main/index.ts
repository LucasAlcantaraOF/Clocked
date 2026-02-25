import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// IMPORTANTE: Registrar actions ANTES de importar EventManager
// para garantir que estejam disponíveis quando o EventManager for carregado
import { actionRegistry } from './actions'
import { shutdownAction } from './actions/shutdown.action'
import { restartAction } from './actions/restart.action'

// Registrar actions disponíveis (deve ser feito antes de importar EventManager)
actionRegistry.register(shutdownAction)
actionRegistry.register(restartAction)

// Agora importar EventManager (que já terá acesso às actions registradas)
import { eventManager, ClockedEvent } from './events/EventManager'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 550,
    show: false,
    frame: false,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Sistema antigo de shutdown removido - agora usa EventManager

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.sleep-schedule.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC Handlers - Sistema de Events
  ipcMain.handle('create-event', async (_, eventData: Omit<ClockedEvent, 'id' | 'createdAt'>) => {
    return await eventManager.createEvent(eventData)
  })

  ipcMain.handle('cancel-event', async (_, eventId: string) => {
    return await eventManager.cancelEvent(eventId)
  })

  ipcMain.handle('get-event', async (_, eventId: string) => {
    return eventManager.getEvent(eventId)
  })

  ipcMain.handle('get-all-events', async () => {
    return eventManager.getAllEvents()
  })

  ipcMain.handle('update-event', async (_, eventId: string, eventData: Omit<ClockedEvent, 'id' | 'createdAt'>) => {
    return await eventManager.updateEvent(eventId, eventData)
  })

  ipcMain.handle('delete-event', async (_, eventId: string) => {
    const deleted = eventManager.deleteEvent(eventId)
    return { success: deleted, message: deleted ? 'Evento deletado' : 'Evento não encontrado' }
  })

  // Handlers de compatibilidade (para manter compatibilidade com código antigo se necessário)
  ipcMain.handle('schedule-shutdown', async (_, targetTime: string) => {
    const date = new Date(targetTime)
    const event = await eventManager.createEvent({
      title: 'Desligar',
      time: date.toTimeString().substring(0, 5),
      actions: [{ id: `shutdown-${Date.now()}`, type: 'shutdown' }]
    })
    return {
      success: event.success,
      message: event.message
    }
  })

  ipcMain.handle('cancel-shutdown', async () => {
    // Cancela todos os eventos com action de shutdown
    const events = eventManager.getAllEvents()
    const shutdownEvents = events.filter(e => e.actions.some(a => a.type === 'shutdown'))
    
    if (shutdownEvents.length === 0) {
      return { success: false, message: 'Nenhum desligamento agendado' }
    }

    // Cancela o primeiro encontrado (comportamento similar ao antigo)
    const result = await eventManager.cancelEvent(shutdownEvents[0].id)
    return result
  })

  ipcMain.handle('get-scheduled-time', () => {
    const events = eventManager.getAllEvents()
    const hasShutdown = events.some(e => e.actions.some(a => a.type === 'shutdown'))
    return hasShutdown ? 'active' : null
  })

  ipcMain.handle('window-close', () => {
    if (mainWindow) {
      mainWindow.close()
    }
  })

  ipcMain.handle('window-minimize', () => {
    if (mainWindow) {
      mainWindow.minimize()
    }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // No Windows e Linux, fecha o app mesmo com timer ativo
  // O timer continuará rodando em background
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // Limpa o timer ao fechar o app (opcional - você pode querer manter o timer)
  // if (shutdownTimer) {
  //   clearTimeout(shutdownTimer)
  // }
})

