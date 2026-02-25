import { useState, useEffect, useRef } from 'react'
import type { ClockedEvent } from '../../preload/index.d'

interface ActionOption {
  type: string
  name: string
  icon: string
}

// Actions principais (sempre visíveis como botões)
const PRIMARY_ACTIONS: ActionOption[] = [
  { type: 'alarm', name: 'Alarme', icon: 'ph-bell' },
  { type: 'shutdown', name: 'Desligar', icon: 'ph-power' },
  { type: 'restart', name: 'Reiniciar', icon: 'ph-arrow-clockwise' }
]

// Actions secundárias (no dropdown)
const SECONDARY_ACTIONS: ActionOption[] = [
  { type: 'lock-screen', name: 'Bloquear Tela', icon: 'ph-lock' },
  { type: 'do-not-disturb', name: 'Modo Não Perturbe', icon: 'ph-moon' },
  { type: 'hibernate', name: 'Hibernar', icon: 'ph-bed' },
  { type: 'open-url', name: 'Abrir URL', icon: 'ph-globe' }
]

// Todas as actions combinadas
const AVAILABLE_ACTIONS: ActionOption[] = [...PRIMARY_ACTIONS, ...SECONDARY_ACTIONS]

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
  const [activeAlarm, setActiveAlarm] = useState<{ actionId: string; title: string; alarmPath?: string } | null>(null)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [actionsDropdownOpen, setActionsDropdownOpen] = useState(false)
  const completedEventsRef = useRef<Set<string>>(new Set())
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null)
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const currentAlarmPathRef = useRef<string | null>(null)
  const actionsDropdownRef = useRef<HTMLDivElement | null>(null)

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
      console.log('🔔 Renderer recebeu alarm-triggered:', data)
      setActiveAlarm({ actionId: data.actionId, title: data.title, alarmPath: data.alarmPath })
      
      // Armazena o caminho do alarme em uma ref para uso no loop
      if (data.alarmPath) {
        currentAlarmPathRef.current = data.alarmPath
        playAlarmSound(data.alarmPath)
      }
    })

    // Listener para alarme parado
    window.api.onAlarmStopped(() => {
      console.log('🔕 Renderer recebeu alarm-stopped')
      stopAlarmSound()
      setActiveAlarm(null)
      currentAlarmPathRef.current = null
    })

    // Fecha popup ao clicar fora
    const handleClickOutside = (event: MouseEvent): void => {
      if (actionsDropdownRef.current && !actionsDropdownRef.current.contains(event.target as Node)) {
        setActionsDropdownOpen(false)
      }
    }

    if (actionsDropdownOpen) {
      // Usa click ao invés de mousedown para permitir que o onClick dos chips seja processado
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside)
      }, 0)
    }

    return () => {
      clearInterval(interval)
      window.api.removeAlarmListeners()
      stopAlarmSound()
      document.removeEventListener('click', handleClickOutside)
    }
  }, [actionsDropdownOpen])

  // Função para tocar o alarme
  const playAlarmSound = (alarmPath: string): void => {
    // Para qualquer alarme anterior
    stopAlarmSound()
    
    try {
      // Tenta diferentes formatos de caminho
      const audioUrls: string[] = []
      
      // Se já é uma URL completa (http/https/app://), usa diretamente
      if (alarmPath.startsWith('http://') || alarmPath.startsWith('https://') || alarmPath.startsWith('app://')) {
        audioUrls.push(alarmPath)
      } 
      // Se é caminho relativo (começa com /), tenta diferentes variações
      else if (alarmPath.startsWith('/')) {
        audioUrls.push(alarmPath)
        // Tenta também com protocolo app://
        audioUrls.push(`app://${alarmPath.substring(1)}`)
        // Tenta também sem a barra inicial
        audioUrls.push(alarmPath.substring(1))
      }
      // Para caminhos absolutos do sistema
      else {
        const normalizedPath = alarmPath.replace(/\\/g, '/')
        // Tenta com protocolo app:// primeiro
        if (normalizedPath.includes('public')) {
          const relativePath = normalizedPath.split('public')[1]
          audioUrls.push(`app://public${relativePath}`)
        }
        audioUrls.push(`file:///${normalizedPath}`)
        // Fallback: caminho relativo
        audioUrls.push('/alarm-1.mp3')
        audioUrls.push('app://public/alarm-1.mp3')
      }
      
      // Tenta tocar com cada URL até uma funcionar
      const tryPlayAudio = (urls: string[], index: number = 0): void => {
        if (index >= urls.length) {
          console.error('❌ Todas as tentativas de tocar o áudio falharam')
          return
        }
        
        const audioUrl = urls[index]
        console.log(`   Tentando tocar áudio (tentativa ${index + 1}/${urls.length}): ${audioUrl}`)
        
        const audio = new Audio(audioUrl)
        audio.volume = 1.0
        audio.loop = false
        
        // Adiciona o listener ANTES de tocar para garantir que seja capturado
        audio.addEventListener('ended', () => {
          console.log('🔔 Áudio terminou, tocando novamente imediatamente...')
          // Usa apenas a ref para verificar se o alarme ainda está ativo
          const alarmPath = currentAlarmPathRef.current
          if (alarmPath) {
            // Toca imediatamente, sem esperar
            playAlarmSound(alarmPath)
          } else {
            console.log('🔕 Caminho do alarme não encontrado, não tocando novamente')
          }
        })
        
        audio.play().then(() => {
          console.log(`✅ Áudio tocando com: ${audioUrl}`)
          alarmAudioRef.current = audio
        }).catch(error => {
          console.warn(`   Falhou: ${audioUrl} - ${error.message}`)
          // Tenta próxima URL
          tryPlayAudio(urls, index + 1)
        })
      }
      
      tryPlayAudio(audioUrls)
    } catch (error) {
      console.error('❌ Erro ao criar elemento de áudio:', error)
    }
  }

  // Função para parar o alarme
  const stopAlarmSound = (): void => {
    if (alarmAudioRef.current) {
      alarmAudioRef.current.pause()
      alarmAudioRef.current.currentTime = 0
      // Remove todos os listeners antes de limpar
      const audio = alarmAudioRef.current
      audio.removeEventListener('ended', () => {})
      alarmAudioRef.current = null
    }
    if (alarmIntervalRef.current) {
      clearTimeout(alarmIntervalRef.current)
      alarmIntervalRef.current = null
    }
  }

  // Atualiza tempo restante e marca eventos concluídos
  useEffect(() => {
    if (events.length === 0) {
      setTimeRemaining(new Map())
      completedEventsRef.current.clear()
      return
    }

    const updateTimeRemaining = () => {
      const now = new Date()
      const newTimeRemaining = new Map<string, string>()
      const eventsToUpdate: Array<{ id: string; event: ClockedEvent }> = []

      events.forEach(event => {
        if (!event.targetDateTime) {
          newTimeRemaining.set(event.id, '')
          return
        }

        const diff = event.targetDateTime.getTime() - now.getTime()

        if (diff <= 0) {
          // Evento passou - marca como concluído
          if (!event.completed && !completedEventsRef.current.has(event.id)) {
            completedEventsRef.current.add(event.id)
            eventsToUpdate.push({ id: event.id, event })
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
        } else {
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
        }
      })

      // Atualiza eventos concluídos apenas se houver mudanças
      if (eventsToUpdate.length > 0) {
        setEvents(prevEvents => {
          return prevEvents.map(event => {
            const toUpdate = eventsToUpdate.find(e => e.id === event.id)
            return toUpdate ? { ...event, completed: true } : event
          })
        })
      }

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
    setShowCloseConfirm(true)
  }

  const handleCloseConfirm = async (): Promise<void> => {
    setShowCloseConfirm(false)
    await window.api.windowCloseConfirm()
  }

  const handleMinimizeToTray = async (): Promise<void> => {
    setShowCloseConfirm(false)
    await window.api.windowMinimizeToTray()
  }

  const handleCancelClose = (): void => {
    setShowCloseConfirm(false)
  }

  const handleMinimize = (): void => {
    window.api.windowMinimize()
  }

  return (
    <div className="app">
      <div className="title-bar">
        <div className="title-bar-drag-region">
          <span className="title-text">Uclocked</span>
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
          <div style={{ fontWeight: 800, color: 'var(--primary)' }}>UCLOCKED</div>
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
            <div className="actions-selector-wrapper" ref={actionsDropdownRef}>
              <div className="actions-selector">
                {PRIMARY_ACTIONS.map(action => (
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
                <button
                  type="button"
                  className="actions-dropdown-arrow-btn"
                  onClick={() => setActionsDropdownOpen(!actionsDropdownOpen)}
                  title="Mais actions"
                >
                  <i className={`ph ph-caret-down actions-dropdown-arrow ${actionsDropdownOpen ? 'open' : ''}`}></i>
                </button>
              </div>
              {actionsDropdownOpen && (
                <div className="actions-popup">
                  {SECONDARY_ACTIONS.map(action => {
                    const isSelected = selectedActions.includes(action.type)
                    return (
                      <button
                        key={action.type}
                        type="button"
                        className={`action-chip ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          toggleAction(action.type)
                        }}
                        title={action.name}
                      >
                        <i className={`ph ${getActionIcon(action.type)}`}></i>
                      </button>
                    )
                  })}
                </div>
              )}
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

        {/* Toast de Confirmação de Fechar */}
        {showCloseConfirm && (
          <div className="close-confirm-toast">
            <div className="close-confirm-content">
              <div className="close-confirm-icon">
                <i className="ph ph-warning"></i>
              </div>
              <div className="close-confirm-text">
                <div className="close-confirm-title">Fechar Uclocked?</div>
                <div className="close-confirm-message">O aplicativo continuará rodando em segundo plano</div>
              </div>
              <div className="close-confirm-buttons">
                <button
                  className="close-confirm-btn minimize-btn"
                  onClick={handleMinimizeToTray}
                >
                  <i className="ph ph-tray"></i>
                  Minimizar
                </button>
                <button
                  className="close-confirm-btn close-btn"
                  onClick={handleCloseConfirm}
                >
                  <i className="ph ph-x"></i>
                  Fechar
                </button>
                <button
                  className="close-confirm-btn cancel-btn"
                  onClick={handleCancelClose}
                >
                  Cancelar
                </button>
              </div>
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
