import { exec } from 'child_process'
import { promisify } from 'util'
import { IAction, ActionConfig, ActionResult } from './index'
import { BrowserWindow } from 'electron'

const execAsync = promisify(exec)

const dndTimers: Map<string, NodeJS.Timeout> = new Map()

export class DoNotDisturbAction implements IAction {
  type = 'do-not-disturb'
  name = 'Modo Não Perturbe'
  icon = 'ph-moon'

  async execute(config: ActionConfig, targetTime: Date): Promise<ActionResult> {
    try {
      const now = new Date()
      const delay = targetTime.getTime() - now.getTime()

      if (delay <= 0) {
        // Executa imediatamente
        return await this.executeDND(true)
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
      if (dndTimers.has(config.id)) {
        const oldTimer = dndTimers.get(config.id)
        if (oldTimer) clearTimeout(oldTimer)
      }

      // Cria novo timer
      const timer = setTimeout(async () => {
        await this.executeDND(true)
        dndTimers.delete(config.id)
      }, delay)

      dndTimers.set(config.id, timer)

      return {
        success: true,
        message: `Modo não perturbe agendado para ${targetTime.toLocaleString('pt-BR')}`,
        data: { timerId: timer }
      }
    } catch (error) {
      console.error('❌ Erro ao agendar modo não perturbe:', error)
      return {
        success: false,
        message: 'Erro ao agendar o modo não perturbe'
      }
    }
  }

  private async executeDND(enable: boolean): Promise<ActionResult> {
    try {
      const platform = process.platform

      if (platform === 'win32') {
        // No Windows, podemos usar Focus Assist (modo não perturbe)
        // Por enquanto, apenas notificamos via console
        console.log(`🔕 Modo não perturbe ${enable ? 'ativado' : 'desativado'}`)
      } else if (platform === 'darwin') {
        // macOS - usar Do Not Disturb
        const command = enable
          ? 'defaults -currentHost write ~/Library/Preferences/ByHost/com.apple.notificationcenterui doNotDisturb -boolean true'
          : 'defaults -currentHost write ~/Library/Preferences/ByHost/com.apple.notificationcenterui doNotDisturb -boolean false'
        await execAsync(command)
      } else {
        // Linux - depende do ambiente
        console.log(`🔕 Modo não perturbe ${enable ? 'ativado' : 'desativado'}`)
      }

      // Notifica todas as janelas
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(window => {
        window.webContents.send('dnd-triggered', {
          enabled: enable
        })
      })

      return {
        success: true,
        message: `Modo não perturbe ${enable ? 'ativado' : 'desativado'} com sucesso`
      }
    } catch (error) {
      console.error('❌ Erro ao ativar modo não perturbe:', error)
      return {
        success: false,
        message: 'Erro ao ativar o modo não perturbe'
      }
    }
  }

  async cancel(config: ActionConfig): Promise<ActionResult> {
    try {
      const timer = dndTimers.get(config.id)
      if (timer) {
        clearTimeout(timer)
        dndTimers.delete(config.id)

        return {
          success: true,
          message: 'Modo não perturbe cancelado com sucesso'
        }
      }

      return {
        success: false,
        message: 'Nenhum modo não perturbe agendado para cancelar'
      }
    } catch (error) {
      console.error('❌ Erro ao cancelar modo não perturbe:', error)
      return {
        success: false,
        message: 'Erro ao cancelar o modo não perturbe'
      }
    }
  }

  validate(config: ActionConfig): { valid: boolean; error?: string } {
    return { valid: true }
  }
}

export const doNotDisturbAction = new DoNotDisturbAction()

