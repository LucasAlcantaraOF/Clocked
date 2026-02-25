import { useState, useEffect } from 'react'
import type { ClockedEvent } from '../../preload/index.d'

interface ActionOption {
  type: string
  name: string
  icon: string
}

const AVAILABLE_ACTIONS: ActionOption[] = [
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
  const [selectedActions, setSelectedActions] = useState<string[]>(['shutdown'])
  const [events, setEvents] = useState<ClockedEvent[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | '' }>({
    text: '',
    type: ''
  })

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

    return () => clearInterval(interval)
  }, [])

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
    setTimeout(() => {
      setMessage({ text: '', type: '' })
    }, 5000)
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
    setSelectedActions(['shutdown'])
    setEditingId(null)
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

        {message.text && (
          <div className={`message message-${message.type}`}>{message.text}</div>
        )}

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
        </div>

        <div className={`timeline-container ${events.length === 0 ? 'empty' : ''}`} id="timeline">
          {events.length === 0 ? (
            <div className="empty-state">
              <i className="ph ph-clock" style={{ fontSize: '3rem', opacity: 0.3 }}></i>
              <p>Nenhum evento agendado</p>
            </div>
          ) : (
            events.map((event) => (
              <div key={event.id} className="event-node">
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
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default App
