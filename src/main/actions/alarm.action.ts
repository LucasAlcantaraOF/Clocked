import { exec, ChildProcess } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
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

      if (delay <= 0) {
        return {
          success: false,
          message: 'O horário selecionado já passou'
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
        // Obtém o caminho do arquivo de alarme (fora do try para estar disponível no catch)
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

        // Notifica o renderer que o alarme está tocando
        const windows = BrowserWindow.getAllWindows()
        windows.forEach(window => {
          window.webContents.send('alarm-triggered', {
            actionId: config.id,
            title: eventTitle
          })
        })

        // Inicia o loop do alarme
        this.startAlarmLoop(config.id, alarmPath)
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
      // Windows: usa PowerShell para tocar o MP3
      const escapedPath = alarmPath.replace(/\\/g, '\\\\').replace(/'/g, "''")
      playAlarm = () => {
        exec(`powershell -Command "$player = New-Object -ComObject WMPLib.WindowsMediaPlayer; $player.URL = '${escapedPath}'; $player.controls.play(); Start-Sleep -Seconds 1"`, () => {})
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
    
    // Toca o alarme imediatamente
    playAlarm()

    // Cria um intervalo para tocar o alarme em loop
    // O arquivo tem aproximadamente 3-4 segundos, então toca a cada 3.5 segundos
    const interval = setInterval(() => {
      if (activeAlarms.has(actionId)) {
        playAlarm()
      } else {
        clearInterval(interval)
      }
    }, 3500) // Toca a cada 3.5 segundos para garantir loop contínuo

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

