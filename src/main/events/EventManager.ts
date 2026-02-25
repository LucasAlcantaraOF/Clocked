// Gerenciador de Eventos - Clocked
// Gerencia eventos com múltiplas actions

import { ActionConfig, ActionResult, actionRegistry } from '../actions'

export interface ClockedEvent {
  id: string
  title: string
  time: string // HH:mm
  date?: string // YYYY-MM-DD (opcional, se não fornecido usa hoje)
  repeat?: number // minutos para repetir (0 = não repete)
  actions: ActionConfig[]
  createdAt: Date
  targetDateTime?: Date
  completed?: boolean // Flag para eventos concluídos
}

class EventManager {
  private events: Map<string, ClockedEvent> = new Map()
  private eventTimers: Map<string, NodeJS.Timeout> = new Map()
  private repeatTimers: Map<string, NodeJS.Timeout> = new Map()

  async createEvent(event: Omit<ClockedEvent, 'id' | 'createdAt'>): Promise<{ success: boolean; event?: ClockedEvent; message: string }> {
    try {
      const id = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const now = new Date()
      
      // Calcula data/hora alvo
      let targetDateTime: Date
      if (event.date) {
        targetDateTime = new Date(`${event.date}T${event.time}:00`)
      } else {
        const today = new Date()
        const [hours, minutes] = event.time.split(':').map(Number)
        targetDateTime = new Date(today)
        targetDateTime.setHours(hours, minutes, 0, 0)
        
        // Se o horário já passou hoje, agenda para amanhã
        if (targetDateTime <= now) {
          targetDateTime.setDate(targetDateTime.getDate() + 1)
        }
      }

      const clockedEvent: ClockedEvent = {
        ...event,
        id,
        createdAt: now,
        targetDateTime
      }

      // Validações
      if (targetDateTime <= now) {
        return {
          success: false,
          message: 'O horário selecionado já passou'
        }
      }

      const maxDelay = 24 * 60 * 60 * 1000
      if (targetDateTime.getTime() - now.getTime() > maxDelay) {
        return {
          success: false,
          message: 'O horário não pode ser mais de 24 horas no futuro'
        }
      }

      // Valida actions
      for (const actionConfig of event.actions) {
        const action = actionRegistry.get(actionConfig.type)
        if (!action) {
          return {
            success: false,
            message: `Action tipo "${actionConfig.type}" não encontrada`
          }
        }

        const validation = action.validate?.(actionConfig)
        if (validation && !validation.valid) {
          return {
            success: false,
            message: validation.error || 'Action inválida'
          }
        }
      }

      // Agenda o evento
      await this.scheduleEvent(clockedEvent)

      this.events.set(id, clockedEvent)

      return {
        success: true,
        event: clockedEvent,
        message: 'Evento criado com sucesso'
      }
    } catch (error) {
      console.error('❌ Erro ao criar evento:', error)
      return {
        success: false,
        message: 'Erro ao criar evento'
      }
    }
  }

  private async scheduleEvent(event: ClockedEvent): Promise<void> {
    if (!event.targetDateTime) return

    const now = new Date()
    const delay = event.targetDateTime.getTime() - now.getTime()

    if (delay <= 0) return

    // Cancela timer anterior se existir
    const oldTimer = this.eventTimers.get(event.id)
    if (oldTimer) clearTimeout(oldTimer)

    // Cria timer para executar todas as actions no horário
    const timer = setTimeout(async () => {
      console.log(`⏰ Executando evento: ${event.title} (${event.id})`)
      
      // Executa todas as actions
      if (!event.targetDateTime) {
        console.error('❌ Evento sem targetDateTime')
        return
      }

      for (const actionConfig of event.actions) {
        const action = actionRegistry.get(actionConfig.type)
        if (action) {
          try {
            // Adiciona o título do evento aos params da action
            const configWithTitle = {
              ...actionConfig,
              params: {
                ...actionConfig.params,
                title: event.title
              }
            }
            const result = await action.execute(configWithTitle, event.targetDateTime)
            console.log(`   ${action.name}: ${result.success ? '✅' : '❌'} ${result.message}`)
          } catch (error) {
            console.error(`   ❌ Erro ao executar ${action.name}:`, error)
          }
        }
      }

      // Se tem repeat, agenda novamente
      if (event.repeat && event.repeat > 0 && event.targetDateTime) {
        const newTargetTime = new Date(event.targetDateTime.getTime() + event.repeat * 60 * 1000)
        const newEvent = { ...event, targetDateTime: newTargetTime }
        await this.scheduleEvent(newEvent)
      } else {
        // Remove o evento após executar
        this.events.delete(event.id)
        this.eventTimers.delete(event.id)
      }
    }, delay)

    this.eventTimers.set(event.id, timer)
  }

  async updateEvent(eventId: string, eventData: Omit<ClockedEvent, 'id' | 'createdAt'>): Promise<{ success: boolean; event?: ClockedEvent; message: string }> {
    try {
      const existingEvent = this.events.get(eventId)
      if (!existingEvent) {
        return {
          success: false,
          message: 'Evento não encontrado'
        }
      }

      // Salva dados do evento existente antes de cancelar
      const savedCreatedAt = existingEvent.createdAt

      // Cancela apenas os timers, mas mantém o evento no Map temporariamente
      const timer = this.eventTimers.get(eventId)
      if (timer) {
        clearTimeout(timer)
        this.eventTimers.delete(eventId)
      }

      const repeatTimer = this.repeatTimers.get(eventId)
      if (repeatTimer) {
        clearTimeout(repeatTimer)
        this.repeatTimers.delete(eventId)
      }

      // Cancela todas as actions do evento antigo
      for (const actionConfig of existingEvent.actions) {
        const action = actionRegistry.get(actionConfig.type)
        if (action && action.cancel) {
          try {
            await action.cancel(actionConfig)
          } catch (error) {
            console.error(`Erro ao cancelar ${action.name}:`, error)
          }
        }
      }

      // Calcula nova data/hora alvo
      const now = new Date()
      let targetDateTime: Date
      if (eventData.date) {
        targetDateTime = new Date(`${eventData.date}T${eventData.time}:00`)
      } else {
        const today = new Date()
        const [hours, minutes] = eventData.time.split(':').map(Number)
        targetDateTime = new Date(today)
        targetDateTime.setHours(hours, minutes, 0, 0)
        
        // Se o horário já passou hoje, agenda para amanhã
        if (targetDateTime <= now) {
          targetDateTime.setDate(targetDateTime.getDate() + 1)
        }
      }

      // Validações
      if (targetDateTime <= now) {
        return {
          success: false,
          message: 'O horário selecionado já passou'
        }
      }

      const maxDelay = 24 * 60 * 60 * 1000
      if (targetDateTime.getTime() - now.getTime() > maxDelay) {
        return {
          success: false,
          message: 'O horário não pode ser mais de 24 horas no futuro'
        }
      }

      // Valida actions
      for (const actionConfig of eventData.actions) {
        const action = actionRegistry.get(actionConfig.type)
        if (!action) {
          return {
            success: false,
            message: `Action tipo "${actionConfig.type}" não encontrada`
          }
        }

        const validation = action.validate?.(actionConfig)
        if (validation && !validation.valid) {
          return {
            success: false,
            message: validation.error || 'Action inválida'
          }
        }
      }

      // Cria evento atualizado mantendo o ID e createdAt original
      const updatedEvent: ClockedEvent = {
        ...eventData,
        id: eventId,
        createdAt: savedCreatedAt,
        targetDateTime
      }

      // Agenda o evento atualizado
      await this.scheduleEvent(updatedEvent)

      this.events.set(eventId, updatedEvent)

      return {
        success: true,
        event: updatedEvent,
        message: 'Evento modificado com sucesso'
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar evento:', error)
      return {
        success: false,
        message: 'Erro ao atualizar evento'
      }
    }
  }

  async cancelEvent(eventId: string): Promise<{ success: boolean; message: string }> {
    try {
      const event = this.events.get(eventId)
      if (!event) {
        return {
          success: false,
          message: 'Evento não encontrado'
        }
      }

      // Cancela timer principal
      const timer = this.eventTimers.get(eventId)
      if (timer) {
        clearTimeout(timer)
        this.eventTimers.delete(eventId)
      }

      // Cancela repeat timer se existir
      const repeatTimer = this.repeatTimers.get(eventId)
      if (repeatTimer) {
        clearTimeout(repeatTimer)
        this.repeatTimers.delete(eventId)
      }

      // Cancela todas as actions
      for (const actionConfig of event.actions) {
        const action = actionRegistry.get(actionConfig.type)
        if (action && action.cancel) {
          try {
            await action.cancel(actionConfig)
          } catch (error) {
            console.error(`Erro ao cancelar ${action.name}:`, error)
          }
        }
      }

      this.events.delete(eventId)

      return {
        success: true,
        message: 'Evento cancelado com sucesso'
      }
    } catch (error) {
      console.error('❌ Erro ao cancelar evento:', error)
      return {
        success: false,
        message: 'Erro ao cancelar evento'
      }
    }
  }

  getEvent(eventId: string): ClockedEvent | undefined {
    return this.events.get(eventId)
  }

  getAllEvents(): ClockedEvent[] {
    return Array.from(this.events.values())
  }

  deleteEvent(eventId: string): boolean {
    const event = this.events.get(eventId)
    if (event) {
      // Cancela timers
      const timer = this.eventTimers.get(eventId)
      if (timer) clearTimeout(timer)
      
      const repeatTimer = this.repeatTimers.get(eventId)
      if (repeatTimer) clearTimeout(repeatTimer)

      this.events.delete(eventId)
      this.eventTimers.delete(eventId)
      this.repeatTimers.delete(eventId)
      return true
    }
    return false
  }
}

export const eventManager = new EventManager()

