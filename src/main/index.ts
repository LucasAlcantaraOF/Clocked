import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

let mainWindow: BrowserWindow | null = null
let shutdownTimer: NodeJS.Timeout | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 600,
    minWidth: 450,
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

function calculateShutdownDelay(targetTime: Date): number {
  const now = new Date()
  const delay = targetTime.getTime() - now.getTime()
  return Math.max(0, delay)
}

async function scheduleShutdown(targetTime: Date): Promise<{ success: boolean; message: string }> {
  try {
    console.log('🚀 INÍCIO: scheduleShutdown chamado')
    console.log(`   Horário recebido: ${targetTime.toISOString()}`)
    
    // Cancela qualquer timer anterior
    if (shutdownTimer) {
      console.log(`   ⚠️ Timer anterior encontrado (ID: ${shutdownTimer}), cancelando...`)
      clearTimeout(shutdownTimer)
      shutdownTimer = null
      console.log('⏹️ Timer anterior cancelado')
    } else {
      console.log('   ✅ Nenhum timer anterior encontrado')
    }

    const delay = calculateShutdownDelay(targetTime)
    const delayInSeconds = Math.floor(delay / 1000)
    const delayInMinutes = Math.floor(delayInSeconds / 60)
    const delayInHours = Math.floor(delayInMinutes / 60)

    console.log('📅 Agendando desligamento:')
    console.log(`   Horário alvo: ${targetTime.toLocaleString('pt-BR')}`)
    console.log(`   Delay: ${delayInHours}h ${delayInMinutes % 60}m ${delayInSeconds % 60}s (${delayInSeconds} segundos / ${delay} ms)`)

    if (delay === 0) {
      console.log('❌ ERRO: O horário selecionado já passou')
      return { success: false, message: 'O horário selecionado já passou' }
    }

    // Validação de segurança: máximo 24 horas
    const maxDelay = 24 * 60 * 60 * 1000 // 24 horas em ms
    if (delay > maxDelay) {
      console.log('❌ ERRO: Horário excede o limite de 24 horas')
      return { success: false, message: 'O horário não pode ser mais de 24 horas no futuro' }
    }

    console.log(`   ⏰ Criando timer com delay de ${delay}ms...`)
    shutdownTimer = setTimeout(async () => {
      console.log('🔄 Executando desligamento agora...')
      console.log(`   Timer executado! ID: ${shutdownTimer}`)
      try {
        const platform = process.platform
        let command: string

        if (platform === 'win32') {
          // Windows: shutdown /s /t 0 (desliga imediatamente)
          command = 'shutdown /s /t 0'
        } else if (platform === 'darwin') {
          // macOS: sudo shutdown -h now
          command = 'sudo shutdown -h now'
        } else {
          // Linux: sudo shutdown -h now
          command = 'sudo shutdown -h now'
        }

        console.log(`💻 Executando comando: ${command}`)
        await execAsync(command)
        console.log('✅ Comando de desligamento executado com sucesso')
      } catch (error) {
        console.error('❌ Erro ao desligar o computador:', error)
        // Notifica o renderer sobre o erro
        mainWindow?.webContents.send('shutdown-error', {
          message: 'Erro ao executar o desligamento. Verifique as permissões.'
        })
      }
    }, delay)

    console.log(`✅ Desligamento agendado com sucesso!`)
    console.log(`   Timer ID: ${shutdownTimer}`)
    console.log(`   Timer ativo: ${shutdownTimer !== null}`)
    console.log(`   Tipo do timer: ${typeof shutdownTimer}`)
    return {
      success: true,
      message: `Desligamento agendado para ${targetTime.toLocaleString('pt-BR')}`
    }
  } catch (error) {
    console.error('❌ Erro ao agendar desligamento:', error)
    return {
      success: false,
      message: 'Erro ao agendar o desligamento'
    }
  }
}

// Verifica se há shutdown agendado no Windows
// IMPORTANTE: Esta função tenta cancelar para verificar. Se houver shutdown, ele será cancelado.
// Use apenas para verificação, não para cancelar (use cancelShutdown para isso)
async function checkWindowsShutdownScheduled(): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false
  }

  try {
    // Tenta cancelar - se não houver erro, significa que havia um shutdown agendado
    await execAsync('shutdown /a', { timeout: 2000 })
    // Se não deu erro, havia um shutdown agendado (e foi cancelado)
    console.log('ℹ️ Verificação: Havia um shutdown agendado no Windows (foi cancelado na verificação)')
    return true
  } catch (error: any) {
    // Código 1116 = "Não foi possível anular o desligamento porque o sistema não estava sendo desligado"
    // Isso significa que NÃO há shutdown agendado
    if (error.code === 1116) {
      console.log('ℹ️ Verificação: Nenhum shutdown agendado no Windows')
      return false
    }
    // Outros erros - assume que não há shutdown
    console.log(`ℹ️ Verificação: Erro ao verificar shutdown (código ${error.code})`)
    return false
  }
}

function cancelShutdown(): { success: boolean; message: string } {
  try {
    if (shutdownTimer) {
      console.log(`⏹️ Cancelando timer ID: ${shutdownTimer}`)
      clearTimeout(shutdownTimer)
      shutdownTimer = null
      console.log('⏹️ Timer de desligamento cancelado (Node.js)')

      // No Windows, verifica e cancela shutdown do sistema apenas se existir
      if (process.platform === 'win32') {
        checkWindowsShutdownScheduled()
          .then((hasScheduled) => {
            if (hasScheduled) {
              exec('shutdown /a', (error) => {
                if (error) {
                  console.log('⚠️ Não foi possível cancelar shutdown do Windows (pode não estar agendado)')
                } else {
                  console.log('✅ Shutdown do Windows cancelado')
                }
              })
            } else {
              console.log('ℹ️ Nenhum shutdown agendado no Windows (apenas timer do Node.js foi cancelado)')
            }
          })
          .catch(() => {
            console.log('ℹ️ Verificação de shutdown do Windows ignorada')
          })
      }

      return { success: true, message: 'Desligamento cancelado com sucesso' }
    }

    console.log('⚠️ Nenhum desligamento agendado para cancelar')
    return { success: false, message: 'Nenhum desligamento agendado' }
  } catch (error) {
    console.error('❌ Erro ao cancelar desligamento:', error)
    return { success: false, message: 'Erro ao cancelar o desligamento' }
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.sleep-schedule.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC Handlers
  ipcMain.handle('schedule-shutdown', async (_, targetTime: string) => {
    const date = new Date(targetTime)
    return await scheduleShutdown(date)
  })

  ipcMain.handle('cancel-shutdown', () => {
    return cancelShutdown()
  })

  ipcMain.handle('get-scheduled-time', () => {
    // Retorna null se não há timer ativo
    const hasTimer = shutdownTimer !== null
    console.log(`🔍 Verificando timer: ${hasTimer ? 'ATIVO' : 'INATIVO'} (ID: ${shutdownTimer})`)
    return shutdownTimer ? 'active' : null
  })

  ipcMain.handle('check-windows-shutdown', async () => {
    if (process.platform !== 'win32') {
      return { scheduled: false, message: 'Apenas Windows suporta verificação de shutdown do sistema' }
    }
    const hasScheduled = await checkWindowsShutdownScheduled()
    return {
      scheduled: hasScheduled,
      message: hasScheduled
        ? 'Há um shutdown agendado no Windows'
        : 'Nenhum shutdown agendado no Windows'
    }
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

