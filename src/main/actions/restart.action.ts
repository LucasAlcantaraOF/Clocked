import { exec } from 'child_process'
import { promisify } from 'util'
import { IAction, ActionConfig, ActionResult } from './index'

const execAsync = promisify(exec)

const restartTimers: Map<string, NodeJS.Timeout> = new Map()

export class RestartAction implements IAction {
  type = 'restart'
  name = 'Reiniciar'
  icon = 'ph-arrow-clockwise'

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
      if (restartTimers.has(config.id)) {
        const oldTimer = restartTimers.get(config.id)
        if (oldTimer) clearTimeout(oldTimer)
      }

      // Cria novo timer
      const timer = setTimeout(async () => {
        try {
          const platform = process.platform
          let command: string

          if (platform === 'win32') {
            // Windows: shutdown /r /t 0 (reinicia imediatamente)
            command = 'shutdown /r /t 0'
          } else if (platform === 'darwin') {
            // macOS: sudo reboot
            command = 'sudo reboot'
          } else {
            // Linux: sudo reboot
            command = 'sudo reboot'
          }

          await execAsync(command)
          restartTimers.delete(config.id)
        } catch (error) {
          console.error('❌ Erro ao executar reinicialização:', error)
          restartTimers.delete(config.id)
        }
      }, delay)

      restartTimers.set(config.id, timer)

      return {
        success: true,
        message: `Reinicialização agendada para ${targetTime.toLocaleString('pt-BR')}`,
        data: { timerId: timer }
      }
    } catch (error) {
      console.error('❌ Erro ao agendar reinicialização:', error)
      return {
        success: false,
        message: 'Erro ao agendar a reinicialização'
      }
    }
  }

  async cancel(config: ActionConfig): Promise<ActionResult> {
    try {
      const timer = restartTimers.get(config.id)
      if (timer) {
        clearTimeout(timer)
        restartTimers.delete(config.id)

        // No Windows, tenta cancelar shutdown/restart do sistema se existir
        if (process.platform === 'win32') {
          try {
            await execAsync('shutdown /a', { timeout: 2000 })
          } catch (error: any) {
            // Erro 1116 = não havia shutdown/restart agendado (ok)
            if (error.code !== 1116) {
              console.log('⚠️ Não foi possível cancelar restart do Windows')
            }
          }
        }

        return {
          success: true,
          message: 'Reinicialização cancelada com sucesso'
        }
      }

      return {
        success: false,
        message: 'Nenhuma reinicialização agendada para cancelar'
      }
    } catch (error) {
      console.error('❌ Erro ao cancelar reinicialização:', error)
      return {
        success: false,
        message: 'Erro ao cancelar a reinicialização'
      }
    }
  }

  validate(config: ActionConfig): { valid: boolean; error?: string } {
    return { valid: true }
  }
}

// Exporta a classe para registro manual
export const restartAction = new RestartAction()

