// Sistema de Actions - Uclocked
// Estrutura escalável para diferentes tipos de ações

export interface ActionConfig {
  id: string
  type: string
  params?: Record<string, any>
}

export interface ActionResult {
  success: boolean
  message: string
  data?: any
}

export interface IAction {
  type: string
  name: string
  icon: string
  execute(config: ActionConfig, targetTime: Date): Promise<ActionResult>
  cancel?(config: ActionConfig): Promise<ActionResult>
  validate?(config: ActionConfig): { valid: boolean; error?: string }
}

// Registry de actions
class ActionRegistry {
  private actions: Map<string, IAction> = new Map()

  register(action: IAction): void {
    this.actions.set(action.type, action)
  }

  get(type: string): IAction | undefined {
    return this.actions.get(type)
  }

  getAll(): IAction[] {
    return Array.from(this.actions.values())
  }

  has(type: string): boolean {
    return this.actions.has(type)
  }
}

export const actionRegistry = new ActionRegistry()

// Exportar actions individuais (sem auto-registro para evitar dependência circular)
export { ShutdownAction, shutdownAction } from './shutdown.action'
export { RestartAction, restartAction } from './restart.action'
export { AlarmAction, alarmAction } from './alarm.action'
export { LockScreenAction, lockScreenAction } from './lock-screen.action'
export { DoNotDisturbAction, doNotDisturbAction } from './do-not-disturb.action'
export { HibernateAction, hibernateAction } from './hibernate.action'
export { OpenUrlAction, openUrlAction } from './open-url.action'

