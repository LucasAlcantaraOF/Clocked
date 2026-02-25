# 🕐 Uclocked

Um aplicativo desktop moderno e elegante para agendar eventos e ações automatizadas no seu computador. Crie lembretes, configure alarmes, agende desligamentos e muito mais com uma interface intuitiva e visualmente atraente.

![Uclocked](https://img.shields.io/badge/version-1.0.0-blue)
![Electron](https://img.shields.io/badge/Electron-28.0.0-47848F)
![React](https://img.shields.io/badge/React-18.3.0-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4.0-3178C6)

## ✨ Funcionalidades

### 🎯 Ações Disponíveis

**Ações Principais:**
- 🔔 **Alarme** - Toca um som de alarme no horário agendado
- ⚡ **Desligar** - Desliga o computador automaticamente
- 🔄 **Reiniciar** - Reinicia o sistema no horário definido

**Ações Secundárias:**
- 🔒 **Bloquear Tela** - Bloqueia a tela do computador
- 🌙 **Modo Não Perturbe** - Ativa o modo não perturbe do sistema
- 💤 **Hibernar** - Coloca o computador em modo de hibernação
- 🌐 **Abrir URL** - Abre uma URL específica no navegador padrão

### 📋 Recursos

- ✅ **Interface Moderna** - Design dark theme com efeitos glassmorphism
- ⏰ **Agendamento Flexível** - Agende eventos para até 24 horas no futuro
- 🔁 **Repetição** - Configure eventos para repetir em intervalos personalizados
- 📊 **Visualização em Grid** - Veja todos os eventos em um layout de 3 colunas
- ⏱️ **Contador Regressivo** - Acompanhe o tempo restante para cada evento
- ✅ **Status de Conclusão** - Eventos são automaticamente marcados como concluídos
- 🎨 **Interface Intuitiva** - Fácil de usar, sem complicações

## 🚀 Instalação

### Pré-requisitos

- Node.js 18+ 
- npm ou yarn

### Instalação Local

1. Clone o repositório:
```bash
git clone <url-do-repositorio>
cd Clocked
```

2. Instale as dependências:
```bash
npm install
```

3. Execute em modo de desenvolvimento:
```bash
npm run dev
```

## 🛠️ Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev          # Inicia o app em modo desenvolvimento

# Build
npm run build        # Compila o projeto para produção

# Preview
npm run preview      # Visualiza o build de produção

# Type Checking
npm run typecheck    # Verifica erros de TypeScript
```

## 📦 Build para Produção

Para criar um executável:

```bash
npm run build
```

O executável será gerado na pasta `dist/` com base na configuração do `electron-builder.yml`.

### Plataformas Suportadas

- **Windows** - Instalador NSIS (.exe)
- **macOS** - DMG (.dmg)
- **Linux** - AppImage

## 🎨 Tecnologias

- **Electron** - Framework para aplicativos desktop
- **React** - Biblioteca para interface de usuário
- **TypeScript** - Superset do JavaScript com tipagem estática
- **Vite** - Build tool rápida e moderna
- **Electron Vite** - Template otimizado para Electron + Vite

## 📁 Estrutura do Projeto

```
Clocked/
├── src/
│   ├── main/              # Processo principal (Electron)
│   │   ├── actions/       # Implementações das ações
│   │   │   ├── alarm.action.ts
│   │   │   ├── shutdown.action.ts
│   │   │   ├── restart.action.ts
│   │   │   └── ...
│   │   ├── events/        # Gerenciador de eventos
│   │   │   └── EventManager.ts
│   │   └── index.ts       # Entry point do processo principal
│   ├── preload/           # Scripts de preload
│   │   └── index.ts
│   └── renderer/          # Processo de renderização (React)
│       └── src/
│           ├── App.tsx    # Componente principal
│           └── styles.css # Estilos da aplicação
├── public/                # Arquivos estáticos
│   └── alarm-1.mp3        # Som de alarme
├── package.json
├── electron-builder.yml   # Configuração de build
└── README.md
```

## 💻 Como Usar

1. **Criar um Evento:**
   - Preencha o título do lembrete
   - Selecione o horário desejado
   - (Opcional) Configure a repetição em minutos
   - Escolha uma ou mais ações
   - Clique no botão "+" para adicionar

2. **Gerenciar Eventos:**
   - **Editar**: Clique no ícone de lápis (apenas eventos não concluídos)
   - **Deletar**: Clique no ícone de lixeira
   - Visualize o tempo restante em tempo real

3. **Ações Secundárias:**
   - Clique no botão de seta ao lado das ações principais
   - Um popup aparecerá com as ações secundárias
   - Selecione as ações desejadas

## 🔧 Desenvolvimento

### Adicionar Nova Ação

1. Crie um novo arquivo em `src/main/actions/`:
```typescript
import { IAction, ActionConfig, ActionResult } from './index'

export class MinhaAcaoAction implements IAction {
  type = 'minha-acao'
  name = 'Minha Ação'
  icon = 'ph-icon-name'

  async execute(config: ActionConfig, targetTime: Date): Promise<ActionResult> {
    // Implementação da ação
  }

  async cancel(config: ActionConfig): Promise<ActionResult> {
    // Implementação do cancelamento
  }
}
```

2. Registre a ação em `src/main/index.ts`:
```typescript
import { minhaAcaoAction } from './actions/minha-acao.action'
actionRegistry.register(minhaAcaoAction)
```

3. Adicione a ação na interface em `src/renderer/src/App.tsx`:
```typescript
const SECONDARY_ACTIONS: ActionOption[] = [
  // ...
  { type: 'minha-acao', name: 'Minha Ação', icon: 'ph-icon-name' }
]
```

## 🐛 Troubleshooting

### O desligamento não funciona

No Windows, o comando de desligamento pode precisar de privilégios de administrador. Execute o aplicativo como administrador (botão direito → "Executar como administrador").

### Eventos não aparecem

Certifique-se de que o horário selecionado não está no passado e está dentro do limite de 24 horas.

## 📝 Licença

Este projeto é de código aberto e está disponível sob a licença MIT.

## 👤 Autor

Desenvolvido por mim, Lucas Alcântara, para facilitar o agendamento de tarefas e ações automatizadas.

"Tudo começou quando eu queria assistir filme da cama pelo computador, mas não queria gastar 5 segundos levantando da cama para desligar o computador, fiz um projeto que demorou mais de 5 segundos para automatizar meu problema (risos), mas se tornou um produto muito produtivo para minha rotina"

---

**Nota**: Este aplicativo requer permissões do sistema para executar certas ações (como desligar, reiniciar, etc.). Use com responsabilidade.
