import { exec } from 'child_process'
import { promisify } from 'util'
import { IAction, ActionConfig, ActionResult } from './index'

const execAsync = promisify(exec)

const hibernateTimers: Map<string, NodeJS.Timeout> = new Map()

export class HibernateAction implements IAction {
  type = 'hibernate'
  name = 'Hibernar'
  icon = 'ph-bed'

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
      if (hibernateTimers.has(config.id)) {
        const oldTimer = hibernateTimers.get(config.id)
        if (oldTimer) clearTimeout(oldTimer)
      }

      // Cria novo timer
      const timer = setTimeout(async () => {
        try {
          const platform = process.platform
          let command: string

          if (platform === 'win32') {
            command = 'shutdown /h'
          } else if (platform === 'darwin') {
            // macOS não suporta hibernação nativa, usa sleep
            command = 'pmset sleepnow'
          } else {
            // Linux
            command = 'systemctl hibernate || pm-hibernate'
          }

          await execAsync(command)
          hibernateTimers.delete(config.id)
        } catch (error) {
          console.error('❌ Erro ao executar hibernação:', error)
          hibernateTimers.delete(config.id)
        }
      }, delay)

      hibernateTimers.set(config.id, timer)

      return {
        success: true,
        message: `Hibernação agendada para ${targetTime.toLocaleString('pt-BR')}`,
        data: { timerId: timer }
      }
    } catch (error) {
      console.error('❌ Erro ao agendar hibernação:', error)
      return {
        success: false,
        message: 'Erro ao agendar a hibernação'
      }
    }
  }

  async cancel(config: ActionConfig): Promise<ActionResult> {
    try {
      const timer = hibernateTimers.get(config.id)
      if (timer) {
        clearTimeout(timer)
        hibernateTimers.delete(config.id)

        return {
          success: true,
          message: 'Hibernação cancelada com sucesso'
        }
      }

      return {
        success: false,
        message: 'Nenhuma hibernação agendada para cancelar'
      }
    } catch (error) {
      console.error('❌ Erro ao cancelar hibernação:', error)
      return {
        success: false,
        message: 'Erro ao cancelar a hibernação'
      }
    }
  }

  validate(config: ActionConfig): { valid: boolean; error?: string } {
    return { valid: true }
  }
}

export const hibernateAction = new HibernateAction()

