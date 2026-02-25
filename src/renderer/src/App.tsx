import { useState, useEffect } from 'react'
import type { ClockedEvent } from '../../preload/index.d'

interface ActionOption {
  type: string
  name: string
  icon: string
}

const AVAILABLE_ACTIONS: ActionOption[] = [
  { type: 'alarm', name: 'Alarme', icon: 'ph-bell' },
  { type: 'shutdown', name: 'Desligar', icon: 'ph-power' },
  { type: 'restart', name: 'Reiniciar', icon: 'ph-arrow-clockwise' }
  // Futuras actions podem ser adicionadas aqui
]

function App(): JSX.Element {
  const [currentDate, setCurrentDate] = useState<string>('')
  const [currentTime, setCurrentTime] = useState<string>('00:00')
  const [task, setTask] = useState<string>('')
  const [time, setTime] = useState<string>('')
  const [repeat, setRepeat] = useState<string>('')
  const [selectedActions, setSelectedActions] = useState<string[]>(['alarm'])
  const [events, setEvents] = useState<ClockedEvent[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCanceling, setIsCanceling] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState<Map<string, string>>(new Map())
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | '' }>({
    text: '',
    type: ''
  })
  const [activeAlarm, setActiveAlarm] = useState<{ actionId: string; title: string } | null>(null)

  useEffect(() => {
    // Atualiza relógio
    const updateClock = () => {
      const now = new Date()
      const days = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO']
      const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
      
      setCurrentDate(`${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]}`)
      setCurrentTime(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    }

    updateClock()
    const interval = setInterval(updateClock, 1000)

    // Carrega eventos salvos
    loadEvents()

    // Listener para alarme tocando
    window.api.onAlarmTriggered((data) => {
      setActiveAlarm({ actionId: data.actionId, title: data.title })
    })

    // Listener para alarme parado
    window.api.onAlarmStopped(() => {
      setActiveAlarm(null)
    })

    return () => {
      clearInterval(interval)
      window.api.removeAlarmListeners()
    }
  }, [])

  // Atualiza tempo restante e marca eventos concluídos
  useEffect(() => {
    if (events.length === 0) return

    const updateTimeRemaining = () => {
      const now = new Date()
      const newTimeRemaining = new Map<string, string>()

      setEvents(prevEvents => {
        return prevEvents.map(event => {
          if (!event.targetDateTime) {
            newTimeRemaining.set(event.id, '')
            return event
          }

          const diff = event.targetDateTime.getTime() - now.getTime()

          if (diff <= 0) {
            // Evento passou - marca como concluído
            if (!event.completed) {
              // Atualiza no backend (sem esperar)
              window.api.updateEvent(event.id, {
                title: event.title,
                time: event.time,
                date: event.date,
                repeat: event.repeat,
                actions: event.actions,
                completed: true
              }).catch(console.error)
            }
            newTimeRemaining.set(event.id, 'Concluído')
            return { ...event, completed: true }
          }

          // Calcula tempo restante
          const hours = Math.floor(diff / (1000 * 60 * 60))
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
          const seconds = Math.floor((diff % (1000 * 60)) / 1000)

          let timeStr = ''
          if (hours > 0) {
            timeStr = `${hours}h ${minutes}m`
          } else if (minutes > 0) {
            timeStr = `${minutes}m ${seconds}s`
          } else {
            timeStr = `${seconds}s`
          }

          newTimeRemaining.set(event.id, timeStr)
          return event
        })
      })

      setTimeRemaining(newTimeRemaining)
    }

    updateTimeRemaining()
    const interval = setInterval(updateTimeRemaining, 1000)

    return () => clearInterval(interval)
  }, [events])

  const loadEvents = async (): Promise<void> => {
    try {
      const allEvents = await window.api.getAllEvents()
      setEvents(allEvents)
    } catch (error) {
      console.error('Erro ao carregar eventos:', error)
    }
  }

  const showMessage = (text: string, type: 'success' | 'error'): void => {
    setMessage({ text, type })
    // Remove após 3 segundos (2.6s de exibição + 0.4s de animação de saída)
    setTimeout(() => {
      setMessage({ text: '', type: '' })
    }, 3000)
  }

  const saveNode = async (): Promise<void> => {
    if (!task || !time) {
      showMessage('Preencha título e horário', 'error')
      return
    }

    if (selectedActions.length === 0) {
      showMessage('Selecione pelo menos uma ação', 'error')
      return
    }

    try {
      // Cria actions
      const actions = selectedActions.map(actionType => ({
        id: `${actionType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: actionType
      }))

      let result

      // Se está editando, atualiza o evento
      if (editingId) {
        result = await window.api.updateEvent(editingId, {
          title: task,
          time: time,
          repeat: repeat ? parseInt(repeat) : undefined,
          actions: actions
        })

        if (result.success && result.event) {
          showMessage('Evento modificado com sucesso!', 'success')
          clearInputs()
          await loadEvents()
        } else {
          showMessage(result.message, 'error')
        }
      } else {
        // Cria novo evento
        result = await window.api.createEvent({
          title: task,
          time: time,
          repeat: repeat ? parseInt(repeat) : undefined,
          actions: actions
        })

        if (result.success && result.event) {
          showMessage('Evento criado com sucesso!', 'success')
          clearInputs()
          await loadEvents()
        } else {
          showMessage(result.message, 'error')
        }
      }
    } catch (error) {
      console.error('Erro ao salvar evento:', error)
      showMessage(editingId ? 'Erro ao modificar evento' : 'Erro ao criar evento', 'error')
    }
  }

  const editNode = async (id: string): Promise<void> => {
    const event = events.find(e => e.id === id)
    if (!event) return

    // Preenche o formulário
    setTask(event.title)
    setTime(event.time)
    setRepeat(event.repeat?.toString() || '')
    setSelectedActions(event.actions.map(a => a.type))
    setEditingId(id)

    // Scroll para o topo
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const deleteNode = async (id: string): Promise<void> => {
    try {
      const result = await window.api.deleteEvent(id)
      if (result.success) {
        showMessage('Evento deletado', 'success')
        await loadEvents()
      } else {
        showMessage(result.message, 'error')
      }
    } catch (error) {
      console.error('Erro ao deletar evento:', error)
      showMessage('Erro ao deletar evento', 'error')
    }
  }

  const cancelEvent = async (id: string): Promise<void> => {
    try {
      const result = await window.api.cancelEvent(id)
      if (result.success) {
        showMessage('Evento cancelado', 'success')
        await loadEvents()
      } else {
        showMessage(result.message, 'error')
      }
    } catch (error) {
      console.error('Erro ao cancelar evento:', error)
      showMessage('Erro ao cancelar evento', 'error')
    }
  }

  const clearInputs = (): void => {
    setTask('')
    setTime('')
    setRepeat('')
    setSelectedActions(['alarm'])
    setEditingId(null)
    setIsCanceling(false)
  }

  const handleCancelEdit = (): void => {
    setIsCanceling(true)
    // Aguarda a animação de saída antes de limpar
    setTimeout(() => {
      clearInputs()
    }, 300) // Tempo da animação
  }

  const toggleAction = (actionType: string): void => {
    setSelectedActions(prev => {
      if (prev.includes(actionType)) {
        return prev.filter(a => a !== actionType)
      } else {
        return [...prev, actionType]
      }
    })
  }

  const getActionIcon = (type: string): string => {
    const action = AVAILABLE_ACTIONS.find(a => a.type === type)
    return action?.icon || 'ph-circle'
  }

  const getActionName = (type: string): string => {
    const action = AVAILABLE_ACTIONS.find(a => a.type === type)
    return action?.name || type
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
          <span className="title-text">Clocked</span>
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

      <div className="clocked-container">
        <header className="clocked-header">
          <div className="user-info">
            <p id="current-date">{currentDate}</p>
            <h2 id="current-time">{currentTime}</h2>
          </div>
          <div style={{ fontWeight: 800, color: 'var(--primary)' }}>CLOCKED</div>
        </header>


        <div className="creator-bubble">
          <div className="input-item" style={{ width: '200px' }}>
            <label>O que fazer?</label>
            <input
              type="text"
              id="task"
              placeholder="Título do lembrete"
              value={task}
              onChange={(e) => setTask(e.target.value)}
            />
          </div>
          <div className="input-item">
            <label>Horário</label>
            <input
              type="time"
              id="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="Selecione o horário"
            />
          </div>
          <div className="input-item">
            <label>Repetir (min)</label>
            <input
              type="number"
              id="repeat"
              placeholder="0"
              style={{ width: '60px' }}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </div>
          <div className="input-item" style={{ minWidth: '150px' }}>
            <label>Actions</label>
            <div className="actions-selector">
              {AVAILABLE_ACTIONS.map(action => (
                <button
                  key={action.type}
                  type="button"
                  className={`action-chip ${selectedActions.includes(action.type) ? 'active' : ''}`}
                  onClick={() => toggleAction(action.type)}
                  title={action.name}
                >
                  <i className={`ph ${getActionIcon(action.type)}`}></i>
                </button>
              ))}
            </div>
          </div>
          <button
            className="add-btn"
            id="mainActionBtn"
            onClick={saveNode}
            title={editingId ? 'Salvar alterações' : 'Adicionar evento'}
          >
            <i className={`ph-bold ${editingId ? 'ph-check' : 'ph-plus'}`}></i>
          </button>
          {editingId && (
            <button
              className={`cancel-edit-btn ${isCanceling ? 'exiting' : ''}`}
              onClick={handleCancelEdit}
              title="Cancelar edição"
            >
              <i className="ph ph-x"></i>
            </button>
          )}
        </div>

        <div className={`timeline-container ${events.length === 0 ? 'empty' : ''}`} id="timeline">
          {events.length === 0 ? (
            <div className="empty-state">
              <i className="ph ph-clock" style={{ fontSize: '3rem', opacity: 0.3 }}></i>
              <p>Nenhum evento agendado</p>
            </div>
          ) : (
            events.map((event) => {
              const remaining = timeRemaining.get(event.id) || ''
              const isCompleted = event.completed || false
              
              return (
              <div key={event.id} className={`event-node ${isCompleted ? 'completed' : ''}`}>
                <div className="controls">
                  <button
                    className="control-btn"
                    onClick={() => editNode(event.id)}
                    title="Editar"
                  >
                    <i className="ph ph-pencil-simple"></i>
                  </button>
                  <button
                    className="control-btn del"
                    onClick={() => deleteNode(event.id)}
                    title="Deletar"
                  >
                    <i className="ph ph-trash"></i>
                  </button>
                </div>
                <div className="node-time">{event.time}</div>
                <div className="node-label">{event.title}</div>
                {remaining && (
                  <div className={`node-countdown ${isCompleted ? 'completed' : ''}`}>
                    {isCompleted ? (
                      <>
                        <i className="ph ph-check-circle"></i> Concluído
                      </>
                    ) : (
                      <>
                        <i className="ph ph-clock-countdown"></i> {remaining}
                      </>
                    )}
                  </div>
                )}
                <div className="tag-group">
                  {event.actions.map((action, idx) => (
                    <div key={idx} className="tag active">
                      <i className={`ph-fill ${getActionIcon(action.type)}`}></i>{' '}
                      {getActionName(action.type).toUpperCase()}
                    </div>
                  ))}
                  {event.repeat && event.repeat > 0 && (
                    <div className="tag">
                      <i className="ph ph-arrows-clockwise"></i> CADA {event.repeat}M
                    </div>
                  )}
                </div>
              </div>
              )
            })
          )}
        </div>

        {/* Toast de Mensagem (Evento criado/modificado/etc) */}
        {message.text && (
          <div className={`notification-toast notification-${message.type}`}>
            <div className="notification-content">
              <i className={`ph ${message.type === 'success' ? 'ph-check-circle' : 'ph-warning-circle'}`}></i>
              <span>{message.text}</span>
            </div>
          </div>
        )}

        {/* Toast de Alarme */}
        {activeAlarm && (
          <div className="alarm-toast">
            <div className="alarm-toast-content">
              <div className="alarm-toast-icon">
                <i className="ph ph-bell-ringing"></i>
              </div>
              <div className="alarm-toast-text">
                <div className="alarm-toast-title">Alarme!</div>
                <div className="alarm-toast-message">{activeAlarm.title}</div>
              </div>
              <button
                className="alarm-toast-stop"
                onClick={async () => {
                  await window.api.stopAlarm(activeAlarm.actionId)
                  setActiveAlarm(null)
                }}
              >
                <i className="ph ph-stop"></i>
                Parar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
