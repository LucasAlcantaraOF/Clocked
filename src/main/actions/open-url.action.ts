import { shell } from 'electron'
import { IAction, ActionConfig, ActionResult } from './index'

const urlTimers: Map<string, NodeJS.Timeout> = new Map()

export class OpenUrlAction implements IAction {
  type = 'open-url'
  name = 'Abrir URL'
  icon = 'ph-globe'

  async execute(config: ActionConfig, targetTime: Date): Promise<ActionResult> {
    try {
      const now = new Date()
      const delay = targetTime.getTime() - now.getTime()

      const url = (config.params?.url as string) || ''

      if (!url) {
        return {
          success: false,
          message: 'URL não fornecida'
        }
      }

      // Valida URL básica
      try {
        new URL(url)
      } catch {
        return {
          success: false,
          message: 'URL inválida'
        }
      }

      if (delay <= 0) {
        // Executa imediatamente
        await shell.openExternal(url)
        return {
          success: true,
          message: `URL aberta: ${url}`
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
      if (urlTimers.has(config.id)) {
        const oldTimer = urlTimers.get(config.id)
        if (oldTimer) clearTimeout(oldTimer)
      }

      // Cria novo timer
      const timer = setTimeout(async () => {
        try {
          await shell.openExternal(url)
          urlTimers.delete(config.id)
        } catch (error) {
          console.error('❌ Erro ao abrir URL:', error)
          urlTimers.delete(config.id)
        }
      }, delay)

      urlTimers.set(config.id, timer)

      return {
        success: true,
        message: `Abertura de URL agendada para ${targetTime.toLocaleString('pt-BR')}`,
        data: { timerId: timer, url }
      }
    } catch (error) {
      console.error('❌ Erro ao agendar abertura de URL:', error)
      return {
        success: false,
        message: 'Erro ao agendar a abertura da URL'
      }
    }
  }

  async cancel(config: ActionConfig): Promise<ActionResult> {
    try {
      const timer = urlTimers.get(config.id)
      if (timer) {
        clearTimeout(timer)
        urlTimers.delete(config.id)

        return {
          success: true,
          message: 'Abertura de URL cancelada com sucesso'
        }
      }

      return {
        success: false,
        message: 'Nenhuma abertura de URL agendada para cancelar'
      }
    } catch (error) {
      console.error('❌ Erro ao cancelar abertura de URL:', error)
      return {
        success: false,
        message: 'Erro ao cancelar a abertura da URL'
      }
    }
  }

  validate(config: ActionConfig): { valid: boolean; error?: string } {
    const url = (config.params?.url as string) || ''
    if (!url) {
      return { valid: false, error: 'URL é obrigatória' }
    }

    try {
      new URL(url)
      return { valid: true }
    } catch {
      return { valid: false, error: 'URL inválida' }
    }
  }
}

export const openUrlAction = new OpenUrlAction()

