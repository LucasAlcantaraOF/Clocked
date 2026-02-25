import { app, shell, BrowserWindow, ipcMain, protocol, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readFile } from 'fs/promises'

// IMPORTANTE: Registrar actions ANTES de importar EventManager
// para garantir que estejam disponíveis quando o EventManager for carregado
import { actionRegistry } from './actions'
import { shutdownAction } from './actions/shutdown.action'
import { restartAction } from './actions/restart.action'
import { alarmAction } from './actions/alarm.action'
import { lockScreenAction } from './actions/lock-screen.action'
import { doNotDisturbAction } from './actions/do-not-disturb.action'
import { hibernateAction } from './actions/hibernate.action'
import { openUrlAction } from './actions/open-url.action'

// Registrar actions disponíveis (deve ser feito antes de importar EventManager)
actionRegistry.register(shutdownAction)
actionRegistry.register(restartAction)
actionRegistry.register(alarmAction)
actionRegistry.register(lockScreenAction)
actionRegistry.register(doNotDisturbAction)
actionRegistry.register(hibernateAction)
actionRegistry.register(openUrlAction)

// Agora importar EventManager (que já terá acesso às actions registradas)
import { eventManager, ClockedEvent } from './events/EventManager'

let mainWindow: BrowserWindow | null = null
let systemTray: Tray | null = null
let appIsQuiting = false

// Função para criar system tray
function createSystemTray(): void {
  if (systemTray) return // Já existe

  // Cria um ícone simples usando uma imagem pequena
  // Em Windows, podemos usar um ícone padrão ou criar um ícone simples
  let icon = nativeImage.createEmpty()
  
  // Tenta carregar um ícone se existir
  if (process.platform === 'win32') {
    try {
      const iconPath = join(__dirname, '../resources/icon.png')
      const loadedIcon = nativeImage.createFromPath(iconPath)
      if (!loadedIcon.isEmpty()) {
        icon = loadedIcon
      }
    } catch {
      // Usa ícone vazio se não encontrar
    }
  }
  
  systemTray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir Uclocked',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
        if (systemTray) {
          systemTray.destroy()
          systemTray = null
        }
      }
    },
    {
      label: 'Fechar',
      click: () => {
        appIsQuiting = true
        if (mainWindow) {
          mainWindow.destroy()
        }
        if (systemTray) {
          systemTray.destroy()
          systemTray = null
        }
        app.quit()
      }
    }
  ])

  systemTray.setToolTip('Uclocked')
  systemTray.setContextMenu(contextMenu)

  // Clique duplo no ícone restaura a janela
  systemTray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
    if (systemTray) {
      systemTray.destroy()
      systemTray = null
    }
  })
}

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
    if (systemTray) {
      systemTray.destroy()
      systemTray = null
    }
  })

  // Intercepta o evento de fechar para minimizar em vez de fechar
  mainWindow.on('close', (event) => {
    if (!appIsQuiting) {
      event.preventDefault()
      mainWindow?.hide()
      createSystemTray()
    }
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
  // Registra protocolo customizado para servir arquivos estáticos
  protocol.registerFileProtocol('app', (request, callback) => {
    const filePath = request.url.replace('app://', '').replace(/\//g, '\\')
    const normalizedPath = join(process.cwd(), filePath)
    callback({ path: normalizedPath })
  })
  
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
    // Não fecha diretamente, apenas minimiza para bandeja
    // O renderer vai mostrar o toast de confirmação
    if (mainWindow) {
      mainWindow.hide()
      createSystemTray()
    }
  })

  ipcMain.handle('window-close-confirm', () => {
    // Fecha realmente o aplicativo
    appIsQuiting = true
    if (mainWindow) {
      mainWindow.destroy()
      if (systemTray) {
        systemTray.destroy()
        systemTray = null
      }
      app.quit()
    }
  })

  ipcMain.handle('window-minimize-to-tray', () => {
    // Minimiza para bandeja
    if (mainWindow) {
      mainWindow.hide()
      createSystemTray()
    }
  })

  ipcMain.handle('window-restore', () => {
    // Restaura a janela da bandeja
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
      if (systemTray) {
        systemTray.destroy()
        systemTray = null
      }
    }
  })

  ipcMain.handle('window-minimize', () => {
    if (mainWindow) {
      mainWindow.minimize()
    }
  })

  // Handler para parar alarme
  ipcMain.handle('stop-alarm', (_, actionId: string) => {
    alarmAction.stopAlarm(actionId)
    return { success: true, message: 'Alarme parado' }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Não fecha o app automaticamente, permite minimizar para bandeja
  // app.quit() só será chamado quando o usuário confirmar o fechamento
})

app.on('before-quit', () => {
  // Limpa o timer ao fechar o app (opcional - você pode querer manter o timer)
  // if (shutdownTimer) {
  //   clearTimeout(shutdownTimer)
  // }
})

