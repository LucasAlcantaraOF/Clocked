import { exec, spawn } from 'child_process'
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

      // Se delay <= 0, executa imediatamente (evento já chegou)
      if (delay <= 0) {
        console.log('🔌 Executando desligamento imediatamente')
        try {
          const platform = process.platform
          let command: string

          if (platform === 'win32') {
            // No Windows, tenta múltiplos métodos
            console.log('   Tentando método 1: shutdown.exe direto...')
            
            // Método 1: Usa spawn para melhor controle
            const shutdownProcess = spawn('shutdown.exe', ['/s', '/t', '0', '/f'], {
              windowsHide: true,
              detached: true,
              stdio: 'ignore'
            })
            
            shutdownProcess.on('error', (error: any) => {
              console.error('❌ Erro no método 1 (shutdown.exe):', error.message)
              
              // Método 2: Tenta via cmd
              console.log('   Tentando método 2: cmd /c shutdown...')
              const cmdProcess = spawn('cmd.exe', ['/c', 'shutdown', '/s', '/t', '0', '/f'], {
                windowsHide: true,
                detached: true,
                stdio: 'ignore'
              })
              
              cmdProcess.on('error', (error2: any) => {
                console.error('❌ Erro no método 2 (cmd):', error2.message)
                
                // Método 3: Tenta via PowerShell
                console.log('   Tentando método 3: PowerShell Stop-Computer...')
                const psProcess = spawn('powershell.exe', [
                  '-NoProfile',
                  '-ExecutionPolicy', 'Bypass',
                  '-Command', 'Stop-Computer -Force'
                ], {
                  windowsHide: true,
                  detached: true,
                  stdio: 'ignore'
                })
                
                psProcess.on('error', (error3: any) => {
                  console.error('❌ Erro no método 3 (PowerShell):', error3.message)
                  console.error('   Todos os métodos falharam. Verifique se o aplicativo tem privilégios de administrador.')
                })
                
                psProcess.unref()
              })
              
              cmdProcess.unref()
            })
            
            shutdownProcess.unref()
            console.log('✅ Comando de desligamento iniciado')
          } else if (platform === 'darwin') {
            command = 'sudo shutdown -h now'
            console.log(`   Executando comando: ${command}`)
            exec(command, (error) => {
              if (error) {
                console.error('❌ Erro ao executar desligamento:', error)
              } else {
                console.log('✅ Comando de desligamento executado')
              }
            })
          } else {
            command = 'sudo shutdown -h now'
            console.log(`   Executando comando: ${command}`)
            exec(command, (error) => {
              if (error) {
                console.error('❌ Erro ao executar desligamento:', error)
              } else {
                console.log('✅ Comando de desligamento executado')
              }
            })
          }

          // Retorna sucesso imediatamente (não espera o callback)
          return {
            success: true,
            message: 'Desligando o sistema agora...',
            data: { immediate: true }
          }
        } catch (error) {
          console.error('❌ Erro ao executar desligamento:', error)
          return {
            success: false,
            message: 'Erro ao executar o desligar'
          }
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
            console.log('   Executando desligamento agendado...')
            
            // Usa spawn para melhor controle
            const shutdownProcess = spawn('shutdown.exe', ['/s', '/t', '0', '/f'], {
              windowsHide: true,
              detached: true,
              stdio: 'ignore'
            })
            
            shutdownProcess.on('error', (error: any) => {
              console.error('❌ Erro ao executar desligamento:', error.message)
              // Tenta método alternativo
              const psProcess = spawn('powershell.exe', [
                '-NoProfile',
                '-ExecutionPolicy', 'Bypass',
                '-Command', 'Stop-Computer -Force'
              ], {
                windowsHide: true,
                detached: true,
                stdio: 'ignore'
              })
              
              psProcess.on('error', (error2: any) => {
                console.error('❌ Erro no método alternativo:', error2.message)
              })
              
              psProcess.unref()
            })
            
            shutdownProcess.unref()
            console.log('✅ Comando de desligamento iniciado')
          } else if (platform === 'darwin') {
            command = 'sudo shutdown -h now'
            console.log(`   Executando comando: ${command}`)
            exec(command, (error) => {
              if (error) {
                console.error('❌ Erro ao executar desligamento:', error)
              } else {
                console.log('✅ Comando de desligamento executado')
              }
            })
          } else {
            command = 'sudo shutdown -h now'
            console.log(`   Executando comando: ${command}`)
            exec(command, (error) => {
              if (error) {
                console.error('❌ Erro ao executar desligamento:', error)
              } else {
                console.log('✅ Comando de desligamento executado')
              }
            })
          }
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

