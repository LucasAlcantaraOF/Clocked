import { exec } from 'child_process'
import { promisify } from 'util'
import { IAction, ActionConfig, ActionResult } from './index'

const execAsync = promisify(exec)

interface ShutdownActionParams {
  timerId?: NodeJS.Timeout
}

const shutdownTimers: Map<string, NodeJS.Timeout> = new Map()

export class ShutdownAction implements IAction {
  type = 'shutdown'
  name = 'Desligar'
  icon = 'ph-power'

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
      if (shutdownTimers.has(config.id)) {
        const oldTimer = shutdownTimers.get(config.id)
        if (oldTimer) clearTimeout(oldTimer)
      }

      // Cria novo timer
      const timer = setTimeout(async () => {
        try {
          const platform = process.platform
          let command: string

          if (platform === 'win32') {
            command = 'shutdown /s /t 0'
          } else if (platform === 'darwin') {
            command = 'sudo shutdown -h now'
          } else {
            command = 'sudo shutdown -h now'
          }

          await execAsync(command)
          shutdownTimers.delete(config.id)
        } catch (error) {
          console.error('❌ Erro ao executar desligamento:', error)
          shutdownTimers.delete(config.id)
        }
      }, delay)

      shutdownTimers.set(config.id, timer)

      return {
        success: true,
        message: `Desligar agendado para ${targetTime.toLocaleString('pt-BR')}`,
        data: { timerId: timer }
      }
    } catch (error) {
      console.error('❌ Erro ao agendar desligamento:', error)
      return {
        success: false,
          message: 'Erro ao agendar o desligar'
      }
    }
  }

  async cancel(config: ActionConfig): Promise<ActionResult> {
    try {
      const timer = shutdownTimers.get(config.id)
      if (timer) {
        clearTimeout(timer)
        shutdownTimers.delete(config.id)

        // No Windows, tenta cancelar shutdown do sistema se existir
        if (process.platform === 'win32') {
          try {
            await execAsync('shutdown /a', { timeout: 2000 })
          } catch (error: any) {
            // Erro 1116 = não havia shutdown agendado (ok)
            if (error.code !== 1116) {
              console.log('⚠️ Não foi possível cancelar shutdown do Windows')
            }
          }
        }

        return {
          success: true,
          message: 'Desligar cancelado com sucesso'
        }
      }

      return {
        success: false,
          message: 'Nenhum desligar agendado para cancelar'
      }
    } catch (error) {
      console.error('❌ Erro ao cancelar desligamento:', error)
      return {
        success: false,
          message: 'Erro ao cancelar o desligar'
      }
    }
  }

  validate(config: ActionConfig): { valid: boolean; error?: string } {
    return { valid: true }
  }
}

// Exporta a classe para registro manual
export const shutdownAction = new ShutdownAction()

