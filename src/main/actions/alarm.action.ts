import { exec, ChildProcess } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { existsSync } from 'fs'
import { app, BrowserWindow } from 'electron'
import { IAction, ActionConfig, ActionResult } from './index'

const execAsync = promisify(exec)

const alarmTimers: Map<string, NodeJS.Timeout> = new Map()
const activeAlarms: Map<string, { process: ChildProcess; interval: NodeJS.Timeout; title: string }> = new Map()

export class AlarmAction implements IAction {
  type = 'alarm'
  name = 'Alarme'
  icon = 'ph-bell'

  async execute(config: ActionConfig, targetTime: Date): Promise<ActionResult> {
    try {
      const now = new Date()
      const delay = targetTime.getTime() - now.getTime()

      // Obtém o caminho do arquivo de alarme
      const isDev = !app.isPackaged
      let alarmPath: string

      if (isDev) {
        // Em desenvolvimento, usa o caminho da pasta public relativo ao cwd
        alarmPath = join(process.cwd(), 'public', 'alarm-1.mp3')
      } else {
        // Em produção, o arquivo está em extraResources
        // electron-builder coloca extraResources em process.resourcesPath
        const resourcesPath = process.resourcesPath || app.getAppPath()
        alarmPath = join(resourcesPath, 'public', 'alarm-1.mp3')
      }

      // Obtém o título do evento (se disponível)
      const eventTitle = (config.params?.title as string) || 'Alarme'

      // Se o delay é <= 0, toca o alarme imediatamente (evento já chegou)
      if (delay <= 0) {
        console.log(`🔔 Alarme disparado imediatamente: ${eventTitle}`)
        console.log(`   Caminho do alarme: ${alarmPath}`)
        console.log(`   Arquivo existe: ${existsSync(alarmPath)}`)
        
        // Notifica o renderer que o alarme está tocando
        // Usa protocolo customizado app:// para servir o arquivo
        const audioPath = 'app://public/alarm-1.mp3'
        
        const windows = BrowserWindow.getAllWindows()
        console.log(`   Janelas encontradas: ${windows.length}`)
        windows.forEach(window => {
          console.log(`   Enviando 'alarm-triggered' para janela: ${window.id}`)
          window.webContents.send('alarm-triggered', {
            actionId: config.id,
            title: eventTitle,
            alarmPath: audioPath
          })
        })

        // O renderer process vai tocar o áudio diretamente

        return {
          success: true,
          message: `Alarme tocando agora`,
          data: { immediate: true }
        }
      }

      // Validação de segurança: máximo 24 horas
      const maxDelay = 24 * 60 * 60 * 1000
      if (delay > maxDelay) {
        return {
          success: false,
          message: 'O horário não pode ser mais de 24 horas no futuro'
        }
      }

      // Cancela timer anterior se existir
      if (alarmTimers.has(config.id)) {
        const oldTimer = alarmTimers.get(config.id)
        if (oldTimer) clearTimeout(oldTimer)
      }

      // Cria novo timer
      const timer = setTimeout(async () => {
        console.log(`🔔 Alarme disparado: ${eventTitle}`)

        // Notifica o renderer que o alarme está tocando
        // Usa protocolo customizado app:// para servir o arquivo
        const audioPath = 'app://public/alarm-1.mp3'
        
        const windows = BrowserWindow.getAllWindows()
        windows.forEach(window => {
          window.webContents.send('alarm-triggered', {
            actionId: config.id,
            title: eventTitle,
            alarmPath: audioPath
          })
        })

        // O renderer process vai tocar o áudio diretamente
      }, delay)

      alarmTimers.set(config.id, timer)

      return {
        success: true,
        message: `Alarme agendado para ${targetTime.toLocaleString('pt-BR')}`,
        data: { timerId: timer }
      }
    } catch (error) {
      console.error('❌ Erro ao agendar alarme:', error)
      return {
        success: false,
        message: 'Erro ao agendar o alarme'
      }
    }
  }

  startAlarmLoop(actionId: string, alarmPath: string): void {
    // Para qualquer alarme anterior com o mesmo ID
    this.stopAlarmLoop(actionId)

    const platform = process.platform
    let playAlarm: () => void

    if (platform === 'win32') {
      // Windows: usa métodos modernos sem depender do Windows Media Player obsoleto
      playAlarm = () => {
        // Converte o caminho para formato Windows
        const normalizedPath = alarmPath.replace(/\//g, '\\')
        
        // Método 1: Usa o player padrão do Windows (Groove Music, VLC, etc.)
        // O comando 'start' abre o arquivo com o aplicativo padrão associado
        const command = `cmd /c start "" "${normalizedPath}"`
        
        console.log(`   Tentando tocar: ${alarmPath}`)
        
        exec(command, { windowsHide: true }, (error, stdout, stderr) => {
          if (error) {
            console.error('❌ Erro ao tocar alarme com player padrão:', error.message)
            if (stderr) console.error('   stderr:', stderr)
            
            // Fallback 1: Tenta com PowerShell Start-Process
            const escapedPath = normalizedPath.replace(/'/g, "''")
            const fallback1 = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '${escapedPath}'"`
            console.log('   Tentando fallback 1 (Start-Process)')
            exec(fallback1, { windowsHide: true }, (error2) => {
              if (error2) {
                console.error('❌ Erro no fallback 1:', error2.message)
                
                // Fallback 2: Tenta com ffplay (se instalado)
                const fallback2 = `ffplay -nodisp -autoexit -loglevel quiet "${normalizedPath}"`
                console.log('   Tentando fallback 2 (ffplay)')
                exec(fallback2, { windowsHide: true }, (error3) => {
                  if (error3) {
                    console.error('❌ Erro no fallback 2 (ffplay):', error3.message)
                    console.error('   Dica: Instale FFmpeg para melhor suporte de áudio')
                  } else {
                    console.log('✅ Alarme tocado com ffplay')
                  }
                })
              } else {
                console.log('✅ Alarme tocado com Start-Process')
              }
            })
          } else {
            console.log('✅ Alarme tocado com player padrão')
          }
        })
      }
    } else if (platform === 'darwin') {
      // macOS: usa afplay
      playAlarm = () => {
        exec(`afplay "${alarmPath}"`, () => {})
      }
    } else {
      // Linux: usa paplay
      playAlarm = () => {
        exec(`paplay "${alarmPath}" 2>/dev/null || mplayer "${alarmPath}" 2>/dev/null`, () => {})
      }
    }

    console.log(`🔔 Iniciando alarme em loop: ${alarmPath}`)
    
    // Verifica se o arquivo existe
    if (!existsSync(alarmPath)) {
      console.error(`❌ Arquivo de alarme não encontrado: ${alarmPath}`)
      return
    }
    
    // Toca o alarme imediatamente
    playAlarm()

    // Cria um intervalo para tocar o alarme em loop
    // Toca a cada 6 segundos
    const interval = setInterval(() => {
      if (activeAlarms.has(actionId)) {
        playAlarm()
      } else {
        clearInterval(interval)
      }
    }, 6000) // Toca a cada 6 segundos

    // Cria um processo dummy para manter referência (não usado, mas necessário para o tipo)
    const dummyProcess = {
      killed: false,
      exitCode: null,
      kill: () => {},
      on: () => dummyProcess,
      once: () => dummyProcess,
      removeListener: () => dummyProcess,
      removeAllListeners: () => dummyProcess,
      setMaxListeners: () => dummyProcess,
      getMaxListeners: () => 0,
      listeners: () => [],
      rawListeners: () => [],
      emit: () => false,
      listenerCount: () => 0,
      prependListener: () => dummyProcess,
      prependOnceListener: () => dummyProcess,
      eventNames: () => []
    } as unknown as ChildProcess

    activeAlarms.set(actionId, { process: dummyProcess, interval, title: '' })
  }

  stopAlarmLoop(actionId: string): void {
    const alarm = activeAlarms.get(actionId)
    if (alarm) {
      try {
        // Para o intervalo
        clearInterval(alarm.interval)

        // Tenta parar processos de áudio
        const platform = process.platform
        if (platform === 'win32') {
          // Windows: mata processos PowerShell e Windows Media Player
          exec(`taskkill /F /IM powershell.exe /FI "WINDOWTITLE eq *WindowsMediaPlayer*" 2>nul`, () => {})
          exec(`taskkill /F /IM wmplayer.exe 2>nul`, () => {})
        } else if (platform === 'darwin') {
          // macOS: mata processos afplay
          exec(`pkill -f "afplay.*alarm-1.mp3"`, () => {})
        } else {
          // Linux: mata processos paplay/mplayer
          exec(`pkill -f "paplay.*alarm-1.mp3"`, () => {})
          exec(`pkill -f "mplayer.*alarm-1.mp3"`, () => {})
        }

        // Tenta matar o processo se ainda existir
        if (alarm.process && !alarm.process.killed) {
          try {
            alarm.process.kill('SIGTERM')
            setTimeout(() => {
              if (alarm.process && !alarm.process.killed) {
                alarm.process.kill('SIGKILL')
              }
            }, 500)
          } catch (e) {
            // Ignora erros ao matar processo dummy
          }
        }
      } catch (error) {
        console.error('Erro ao parar processo:', error)
      }
      
      activeAlarms.delete(actionId)

      // Notifica o renderer que o alarme parou
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(window => {
        window.webContents.send('alarm-stopped', { actionId })
      })
    }
  }

  async cancel(config: ActionConfig): Promise<ActionResult> {
    try {
      const timer = alarmTimers.get(config.id)
      if (timer) {
        clearTimeout(timer)
        alarmTimers.delete(config.id)
      }

      // Para o alarme se estiver tocando
      this.stopAlarmLoop(config.id)

      return {
        success: true,
        message: 'Alarme cancelado com sucesso'
      }
    } catch (error) {
      console.error('❌ Erro ao cancelar alarme:', error)
      return {
        success: false,
        message: 'Erro ao cancelar o alarme'
      }
    }
  }

  stopAlarm(actionId: string): void {
    this.stopAlarmLoop(actionId)
  }

  validate(config: ActionConfig): { valid: boolean; error?: string } {
    return { valid: true }
  }
}

// Exporta a classe para registro manual
export const alarmAction = new AlarmAction()

