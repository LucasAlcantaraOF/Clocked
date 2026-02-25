import { useState, useEffect } from 'react'

interface ShutdownStatus {
  scheduled: boolean
  targetTime: Date | null
  timeRemaining: string | null
}

function App(): JSX.Element {
  const [date, setDate] = useState<string>('')
  const [time, setTime] = useState<string>('')
  const [status, setStatus] = useState<ShutdownStatus>({
    scheduled: false,
    targetTime: null,
    timeRemaining: null
  })
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | '' }>({
    text: '',
    type: ''
  })
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Define data e hora padrão (1 hora a partir de agora)
    const now = new Date()
    const defaultTime = new Date(now.getTime() + 60 * 60 * 1000) // +1 hora

    setDate(defaultTime.toISOString().split('T')[0])
    setTime(
      defaultTime.toTimeString().split(' ')[0].substring(0, 5) // HH:mm
    )

    // Verifica se há desligamento agendado
    checkScheduledShutdown()
  }, [])

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (status.scheduled && status.targetTime) {
      interval = setInterval(() => {
        updateTimeRemaining()
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [status.scheduled, status.targetTime])

  const checkScheduledShutdown = async (): Promise<void> => {
    try {
      const result = await window.api.getScheduledTime()
      if (result === 'active') {
        // Se há um timer ativo, mantém o status mas não temos a hora exata
        // Isso é uma limitação - em uma versão melhorada, salvaríamos a hora
        setStatus({ scheduled: true, targetTime: null, timeRemaining: null })
      }
    } catch (error) {
      console.error('Erro ao verificar desligamento agendado:', error)
    }
  }

  const updateTimeRemaining = (): void => {
    if (!status.targetTime) return

    const now = new Date()
    const diff = status.targetTime.getTime() - now.getTime()

    if (diff <= 0) {
      setStatus({ scheduled: false, targetTime: null, timeRemaining: null })
      return
    }

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    setStatus((prev) => ({
      ...prev,
      timeRemaining: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }))
  }

  const handleSchedule = async (): Promise<void> => {
    if (!date || !time) {
      showMessage('Por favor, preencha data e hora', 'error')
      return
    }

    setIsLoading(true)
    setMessage({ text: '', type: '' })

    try {
      const targetDateTime = new Date(`${date}T${time}:00`)
      const now = new Date()

      // Validações
      if (targetDateTime <= now) {
        showMessage('O horário deve ser no futuro', 'error')
        setIsLoading(false)
        return
      }

      const maxTime = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 horas
      if (targetDateTime > maxTime) {
        showMessage('O horário não pode ser mais de 24 horas no futuro', 'error')
        setIsLoading(false)
        return
      }

      const result = await window.api.scheduleShutdown(targetDateTime.toISOString())

      if (result.success) {
        setStatus({
          scheduled: true,
          targetTime: targetDateTime,
          timeRemaining: null
        })
        showMessage(result.message, 'success')
        updateTimeRemaining()
      } else {
        showMessage(result.message, 'error')
      }
    } catch (error) {
      console.error('Erro ao agendar desligamento:', error)
      showMessage('Erro ao agendar o desligamento', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = async (): Promise<void> => {
    setIsLoading(true)
    setMessage({ text: '', type: '' })

    try {
      const result = await window.api.cancelShutdown()

      if (result.success) {
        setStatus({ scheduled: false, targetTime: null, timeRemaining: null })
        showMessage(result.message, 'success')
      } else {
        showMessage(result.message, 'error')
      }
    } catch (error) {
      console.error('Erro ao cancelar desligamento:', error)
      showMessage('Erro ao cancelar o desligamento', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const showMessage = (text: string, type: 'success' | 'error'): void => {
    setMessage({ text, type })
    setTimeout(() => {
      setMessage({ text: '', type: '' })
    }, 5000)
  }

  const handleClose = (): void => {
    window.api.windowClose()
  }

  const handleMinimize = (): void => {
    window.api.windowMinimize()
  }

  return (
    <div className="app">
      <div className="title-bar">
        <div className="title-bar-drag-region">
          <span className="title-text">Programador de Desligamento</span>
        </div>
        <div className="title-bar-controls">
          <button className="title-bar-button minimize" onClick={handleMinimize} title="Minimizar">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M0 6h12" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          <button className="title-bar-button close" onClick={handleClose} title="Fechar">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="container">
        <header className="header">
          <div className="icon">⏰</div>
          <h1>Programador de Desligamento</h1>
          <p className="subtitle">Agende o desligamento do seu computador</p>
        </header>

        {message.text && (
          <div className={`message message-${message.type}`}>{message.text}</div>
        )}

        <div className="form-section">
          <div className="input-group">
            <label htmlFor="date">Data</label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={status.scheduled || isLoading}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div className="input-group">
            <label htmlFor="time">Hora</label>
            <input
              id="time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={status.scheduled || isLoading}
            />
          </div>
        </div>

        {status.scheduled && (
          <div className="status-card">
            <div className="status-icon">✓</div>
            <div className="status-content">
              <h3>Desligamento Agendado</h3>
              {status.targetTime && (
                <p className="target-time">
                  {status.targetTime.toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              )}
              {status.timeRemaining && (
                <p className="time-remaining">Tempo restante: {status.timeRemaining}</p>
              )}
            </div>
          </div>
        )}

        <div className="actions">
          {!status.scheduled ? (
            <button
              className="btn btn-primary"
              onClick={handleSchedule}
              disabled={isLoading || !date || !time}
            >
              {isLoading ? 'Agendando...' : 'Agendar Desligamento'}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={handleCancel} disabled={isLoading}>
              {isLoading ? 'Cancelando...' : 'Cancelar Desligamento'}
            </button>
          )}
        </div>

        <div className="info">
          <p>⚠️ O computador será desligado automaticamente no horário agendado.</p>
          <p>Certifique-se de salvar seu trabalho antes do horário programado.</p>
        </div>
      </div>
    </div>
  )
}

export default App

