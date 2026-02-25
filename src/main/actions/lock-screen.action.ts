import { exec } from 'child_process'
import { promisify } from 'util'
import { IAction, ActionConfig, ActionResult } from './index'

const execAsync = promisify(exec)

const lockTimers: Map<string, NodeJS.Timeout> = new Map()

export class LockScreenAction implements IAction {
  type = 'lock-screen'
  name = 'Bloquear Tela'
  icon = 'ph-lock'

  async execute(config: ActionConfig, targetTime: Date): Promise<ActionResult> {
    try {
      const now = new Date()
      const delay = targetTime.getTime() - now.getTime()

      if (delay <= 0) {
        // Executa imediatamente
        return await this.executeLock()
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
      if (lockTimers.has(config.id)) {
        const oldTimer = lockTimers.get(config.id)
        if (oldTimer) clearTimeout(oldTimer)
      }

      // Cria novo timer
      const timer = setTimeout(async () => {
        await this.executeLock()
        lockTimers.delete(config.id)
      }, delay)

      lockTimers.set(config.id, timer)

      return {
        success: true,
        message: `Bloquear tela agendado para ${targetTime.toLocaleString('pt-BR')}`,
        data: { timerId: timer }
      }
    } catch (error) {
      console.error('❌ Erro ao agendar bloqueio de tela:', error)
      return {
        success: false,
        message: 'Erro ao agendar o bloqueio de tela'
      }
    }
  }

  private async executeLock(): Promise<ActionResult> {
    try {
      const platform = process.platform
      let command: string

      if (platform === 'win32') {
        command = 'rundll32.exe user32.dll,LockWorkStation'
      } else if (platform === 'darwin') {
        command = '/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend'
      } else {
        // Linux
        command = 'gnome-screensaver-command -l || xdg-screensaver lock || i3lock'
      }

      await execAsync(command)
      return {
        success: true,
        message: 'Tela bloqueada com sucesso'
      }
    } catch (error) {
      console.error('❌ Erro ao bloquear tela:', error)
      return {
        success: false,
        message: 'Erro ao bloquear a tela'
      }
    }
  }

  async cancel(config: ActionConfig): Promise<ActionResult> {
    try {
      const timer = lockTimers.get(config.id)
      if (timer) {
        clearTimeout(timer)
        lockTimers.delete(config.id)

        return {
          success: true,
          message: 'Bloqueio de tela cancelado com sucesso'
        }
      }

      return {
        success: false,
        message: 'Nenhum bloqueio de tela agendado para cancelar'
      }
    } catch (error) {
      console.error('❌ Erro ao cancelar bloqueio de tela:', error)
      return {
        success: false,
        message: 'Erro ao cancelar o bloqueio de tela'
      }
    }
  }

  validate(config: ActionConfig): { valid: boolean; error?: string } {
    return { valid: true }
  }
}

export const lockScreenAction = new LockScreenAction()

