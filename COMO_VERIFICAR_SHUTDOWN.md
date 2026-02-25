# Como Verificar Shutdown Agendado no Windows

## 🔍 Problema Identificado

O erro que você viu acontece porque:
- O app usa `setTimeout` do Node.js para agendar o desligamento
- Quando você cancela, ele tenta usar `shutdown /a` do Windows
- Mas o Windows não tem shutdown agendado porque nunca usamos `shutdown /s /t X`
- O erro 1116 significa: "Não foi possível anular porque o sistema não estava sendo desligado"

## ✅ Solução Implementada

Agora o código:
1. ✅ Cancela o timer do Node.js (sempre funciona)
2. ✅ Verifica se há shutdown do Windows antes de tentar cancelar
3. ✅ Não mostra erro se não houver shutdown do Windows agendado

## 📋 Como Verificar Manualmente

### Opção 1: Via PowerShell/CMD

```powershell
# Verifica se há shutdown agendado (tenta cancelar - se não der erro, havia um)
shutdown /a
```

**Resultado:**
- ✅ **Sem erro** = Havia shutdown agendado (e foi cancelado)
- ❌ **Erro 1116** = Não havia shutdown agendado

### Opção 2: Via Event Viewer (Visualizador de Eventos)

1. Abra o **Visualizador de Eventos** (`eventvwr.msc`)
2. Vá em **Logs do Windows** → **Sistema**
3. Procure por eventos relacionados a "shutdown" ou "desligamento"
4. Filtre por **Fonte**: `Microsoft-Windows-Kernel-General`

### Opção 3: Via Task Scheduler (Agendador de Tarefas)

1. Abra o **Agendador de Tarefas** (`taskschd.msc`)
2. Procure por tarefas relacionadas a shutdown
3. Verifique tarefas agendadas

### Opção 4: Via Código (No App)

O app agora tem uma função para verificar:

```typescript
// No console do DevTools (F12)
await window.api.checkWindowsShutdown()
```

## 🛠️ Comandos Úteis do Windows

```cmd
# Agendar shutdown para 60 segundos
shutdown /s /t 60

# Cancelar shutdown agendado
shutdown /a

# Ver ajuda do comando shutdown
shutdown /?

# Agendar shutdown com mensagem
shutdown /s /t 300 /c "O computador será desligado em 5 minutos"
```

## 📝 Notas Importantes

- O app usa **timer do Node.js** (`setTimeout`), não o comando nativo do Windows
- Isso significa que o shutdown só será executado se o app estiver rodando
- Se você fechar o app, o timer será perdido e o desligamento não acontecerá
- Para shutdown persistente (mesmo com app fechado), seria necessário usar `shutdown /s /t X`

## 🔧 Melhorias Futuras

Para tornar o shutdown persistente (funciona mesmo com app fechado):
- Usar `shutdown /s /t X` do Windows diretamente
- Salvar o horário agendado em arquivo
- Ao abrir o app, verificar se há shutdown pendente e sincronizar

