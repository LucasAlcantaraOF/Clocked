"use strict";
const electron = require("electron");
const path = require("path");
const child_process = require("child_process");
const util = require("util");
const is = {
  dev: !electron.app.isPackaged
};
const platform = {
  isWindows: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux"
};
const electronApp = {
  setAppUserModelId(id) {
    if (platform.isWindows)
      electron.app.setAppUserModelId(is.dev ? process.execPath : id);
  },
  setAutoLaunch(auto) {
    if (platform.isLinux)
      return false;
    const isOpenAtLogin = () => {
      return electron.app.getLoginItemSettings().openAtLogin;
    };
    if (isOpenAtLogin() !== auto) {
      electron.app.setLoginItemSettings({ openAtLogin: auto });
      return isOpenAtLogin() === auto;
    } else {
      return true;
    }
  },
  skipProxy() {
    return electron.session.defaultSession.setProxy({ mode: "direct" });
  }
};
const optimizer = {
  watchWindowShortcuts(window, shortcutOptions) {
    if (!window)
      return;
    const { webContents } = window;
    const { escToCloseWindow = false, zoom = false } = shortcutOptions || {};
    webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown") {
        if (!is.dev) {
          if (input.code === "KeyR" && (input.control || input.meta))
            event.preventDefault();
          if (input.code === "KeyI" && (input.alt && input.meta || input.control && input.shift)) {
            event.preventDefault();
          }
        } else {
          if (input.code === "F12") {
            if (webContents.isDevToolsOpened()) {
              webContents.closeDevTools();
            } else {
              webContents.openDevTools({ mode: "undocked" });
              console.log("Open dev tool...");
            }
          }
        }
        if (escToCloseWindow) {
          if (input.code === "Escape" && input.key !== "Process") {
            window.close();
            event.preventDefault();
          }
        }
        if (!zoom) {
          if (input.code === "Minus" && (input.control || input.meta))
            event.preventDefault();
          if (input.code === "Equal" && input.shift && (input.control || input.meta))
            event.preventDefault();
        }
      }
    });
  },
  registerFramelessWindowIpc() {
    electron.ipcMain.on("win:invoke", (event, action) => {
      const win = electron.BrowserWindow.fromWebContents(event.sender);
      if (win) {
        if (action === "show") {
          win.show();
        } else if (action === "showInactive") {
          win.showInactive();
        } else if (action === "min") {
          win.minimize();
        } else if (action === "max") {
          const isMaximized = win.isMaximized();
          if (isMaximized) {
            win.unmaximize();
          } else {
            win.maximize();
          }
        } else if (action === "close") {
          win.close();
        }
      }
    });
  }
};
const execAsync$1 = util.promisify(child_process.exec);
const shutdownTimers = /* @__PURE__ */ new Map();
class ShutdownAction {
  constructor() {
    this.type = "shutdown";
    this.name = "Desligar";
    this.icon = "ph-power";
  }
  async execute(config, targetTime) {
    try {
      const now = /* @__PURE__ */ new Date();
      const delay = targetTime.getTime() - now.getTime();
      if (delay <= 0) {
        return {
          success: false,
          message: "O horário selecionado já passou"
        };
      }
      const maxDelay = 24 * 60 * 60 * 1e3;
      if (delay > maxDelay) {
        return {
          success: false,
          message: "O horário não pode ser mais de 24 horas no futuro"
        };
      }
      if (shutdownTimers.has(config.id)) {
        const oldTimer = shutdownTimers.get(config.id);
        if (oldTimer) clearTimeout(oldTimer);
      }
      const timer = setTimeout(async () => {
        try {
          const platform2 = process.platform;
          let command;
          if (platform2 === "win32") {
            command = "shutdown /s /t 0";
          } else if (platform2 === "darwin") {
            command = "sudo shutdown -h now";
          } else {
            command = "sudo shutdown -h now";
          }
          await execAsync$1(command);
          shutdownTimers.delete(config.id);
        } catch (error) {
          console.error("❌ Erro ao executar desligamento:", error);
          shutdownTimers.delete(config.id);
        }
      }, delay);
      shutdownTimers.set(config.id, timer);
      return {
        success: true,
        message: `Desligar agendado para ${targetTime.toLocaleString("pt-BR")}`,
        data: { timerId: timer }
      };
    } catch (error) {
      console.error("❌ Erro ao agendar desligamento:", error);
      return {
        success: false,
        message: "Erro ao agendar o desligar"
      };
    }
  }
  async cancel(config) {
    try {
      const timer = shutdownTimers.get(config.id);
      if (timer) {
        clearTimeout(timer);
        shutdownTimers.delete(config.id);
        if (process.platform === "win32") {
          try {
            await execAsync$1("shutdown /a", { timeout: 2e3 });
          } catch (error) {
            if (error.code !== 1116) {
              console.log("⚠️ Não foi possível cancelar shutdown do Windows");
            }
          }
        }
        return {
          success: true,
          message: "Desligar cancelado com sucesso"
        };
      }
      return {
        success: false,
        message: "Nenhum desligar agendado para cancelar"
      };
    } catch (error) {
      console.error("❌ Erro ao cancelar desligamento:", error);
      return {
        success: false,
        message: "Erro ao cancelar o desligar"
      };
    }
  }
  validate(config) {
    return { valid: true };
  }
}
const shutdownAction = new ShutdownAction();
const execAsync = util.promisify(child_process.exec);
const restartTimers = /* @__PURE__ */ new Map();
class RestartAction {
  constructor() {
    this.type = "restart";
    this.name = "Reiniciar";
    this.icon = "ph-arrow-clockwise";
  }
  async execute(config, targetTime) {
    try {
      const now = /* @__PURE__ */ new Date();
      const delay = targetTime.getTime() - now.getTime();
      if (delay <= 0) {
        return {
          success: false,
          message: "O horário selecionado já passou"
        };
      }
      const maxDelay = 24 * 60 * 60 * 1e3;
      if (delay > maxDelay) {
        return {
          success: false,
          message: "O horário não pode ser mais de 24 horas no futuro"
        };
      }
      if (restartTimers.has(config.id)) {
        const oldTimer = restartTimers.get(config.id);
        if (oldTimer) clearTimeout(oldTimer);
      }
      const timer = setTimeout(async () => {
        try {
          const platform2 = process.platform;
          let command;
          if (platform2 === "win32") {
            command = "shutdown /r /t 0";
          } else if (platform2 === "darwin") {
            command = "sudo reboot";
          } else {
            command = "sudo reboot";
          }
          await execAsync(command);
          restartTimers.delete(config.id);
        } catch (error) {
          console.error("❌ Erro ao executar reinicialização:", error);
          restartTimers.delete(config.id);
        }
      }, delay);
      restartTimers.set(config.id, timer);
      return {
        success: true,
        message: `Reinicialização agendada para ${targetTime.toLocaleString("pt-BR")}`,
        data: { timerId: timer }
      };
    } catch (error) {
      console.error("❌ Erro ao agendar reinicialização:", error);
      return {
        success: false,
        message: "Erro ao agendar a reinicialização"
      };
    }
  }
  async cancel(config) {
    try {
      const timer = restartTimers.get(config.id);
      if (timer) {
        clearTimeout(timer);
        restartTimers.delete(config.id);
        if (process.platform === "win32") {
          try {
            await execAsync("shutdown /a", { timeout: 2e3 });
          } catch (error) {
            if (error.code !== 1116) {
              console.log("⚠️ Não foi possível cancelar restart do Windows");
            }
          }
        }
        return {
          success: true,
          message: "Reinicialização cancelada com sucesso"
        };
      }
      return {
        success: false,
        message: "Nenhuma reinicialização agendada para cancelar"
      };
    } catch (error) {
      console.error("❌ Erro ao cancelar reinicialização:", error);
      return {
        success: false,
        message: "Erro ao cancelar a reinicialização"
      };
    }
  }
  validate(config) {
    return { valid: true };
  }
}
const restartAction = new RestartAction();
class ActionRegistry {
  constructor() {
    this.actions = /* @__PURE__ */ new Map();
  }
  register(action) {
    this.actions.set(action.type, action);
  }
  get(type) {
    return this.actions.get(type);
  }
  getAll() {
    return Array.from(this.actions.values());
  }
  has(type) {
    return this.actions.has(type);
  }
}
const actionRegistry = new ActionRegistry();
class EventManager {
  constructor() {
    this.events = /* @__PURE__ */ new Map();
    this.eventTimers = /* @__PURE__ */ new Map();
    this.repeatTimers = /* @__PURE__ */ new Map();
  }
  async createEvent(event) {
    try {
      const id = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const now = /* @__PURE__ */ new Date();
      let targetDateTime;
      if (event.date) {
        targetDateTime = /* @__PURE__ */ new Date(`${event.date}T${event.time}:00`);
      } else {
        const today = /* @__PURE__ */ new Date();
        const [hours, minutes] = event.time.split(":").map(Number);
        targetDateTime = new Date(today);
        targetDateTime.setHours(hours, minutes, 0, 0);
        if (targetDateTime <= now) {
          targetDateTime.setDate(targetDateTime.getDate() + 1);
        }
      }
      const clockedEvent = {
        ...event,
        id,
        createdAt: now,
        targetDateTime
      };
      if (targetDateTime <= now) {
        return {
          success: false,
          message: "O horário selecionado já passou"
        };
      }
      const maxDelay = 24 * 60 * 60 * 1e3;
      if (targetDateTime.getTime() - now.getTime() > maxDelay) {
        return {
          success: false,
          message: "O horário não pode ser mais de 24 horas no futuro"
        };
      }
      for (const actionConfig of event.actions) {
        const action = actionRegistry.get(actionConfig.type);
        if (!action) {
          return {
            success: false,
            message: `Action tipo "${actionConfig.type}" não encontrada`
          };
        }
        const validation = action.validate?.(actionConfig);
        if (validation && !validation.valid) {
          return {
            success: false,
            message: validation.error || "Action inválida"
          };
        }
      }
      await this.scheduleEvent(clockedEvent);
      this.events.set(id, clockedEvent);
      return {
        success: true,
        event: clockedEvent,
        message: "Evento criado com sucesso"
      };
    } catch (error) {
      console.error("❌ Erro ao criar evento:", error);
      return {
        success: false,
        message: "Erro ao criar evento"
      };
    }
  }
  async scheduleEvent(event) {
    if (!event.targetDateTime) return;
    const now = /* @__PURE__ */ new Date();
    const delay = event.targetDateTime.getTime() - now.getTime();
    if (delay <= 0) return;
    const oldTimer = this.eventTimers.get(event.id);
    if (oldTimer) clearTimeout(oldTimer);
    const timer = setTimeout(async () => {
      console.log(`⏰ Executando evento: ${event.title} (${event.id})`);
      if (!event.targetDateTime) {
        console.error("❌ Evento sem targetDateTime");
        return;
      }
      for (const actionConfig of event.actions) {
        const action = actionRegistry.get(actionConfig.type);
        if (action) {
          try {
            const result = await action.execute(actionConfig, event.targetDateTime);
            console.log(`   ${action.name}: ${result.success ? "✅" : "❌"} ${result.message}`);
          } catch (error) {
            console.error(`   ❌ Erro ao executar ${action.name}:`, error);
          }
        }
      }
      if (event.repeat && event.repeat > 0 && event.targetDateTime) {
        const newTargetTime = new Date(event.targetDateTime.getTime() + event.repeat * 60 * 1e3);
        const newEvent = { ...event, targetDateTime: newTargetTime };
        await this.scheduleEvent(newEvent);
      } else {
        this.events.delete(event.id);
        this.eventTimers.delete(event.id);
      }
    }, delay);
    this.eventTimers.set(event.id, timer);
  }
  async updateEvent(eventId, eventData) {
    try {
      const existingEvent = this.events.get(eventId);
      if (!existingEvent) {
        return {
          success: false,
          message: "Evento não encontrado"
        };
      }
      const savedCreatedAt = existingEvent.createdAt;
      const timer = this.eventTimers.get(eventId);
      if (timer) {
        clearTimeout(timer);
        this.eventTimers.delete(eventId);
      }
      const repeatTimer = this.repeatTimers.get(eventId);
      if (repeatTimer) {
        clearTimeout(repeatTimer);
        this.repeatTimers.delete(eventId);
      }
      for (const actionConfig of existingEvent.actions) {
        const action = actionRegistry.get(actionConfig.type);
        if (action && action.cancel) {
          try {
            await action.cancel(actionConfig);
          } catch (error) {
            console.error(`Erro ao cancelar ${action.name}:`, error);
          }
        }
      }
      const now = /* @__PURE__ */ new Date();
      let targetDateTime;
      if (eventData.date) {
        targetDateTime = /* @__PURE__ */ new Date(`${eventData.date}T${eventData.time}:00`);
      } else {
        const today = /* @__PURE__ */ new Date();
        const [hours, minutes] = eventData.time.split(":").map(Number);
        targetDateTime = new Date(today);
        targetDateTime.setHours(hours, minutes, 0, 0);
        if (targetDateTime <= now) {
          targetDateTime.setDate(targetDateTime.getDate() + 1);
        }
      }
      if (targetDateTime <= now) {
        return {
          success: false,
          message: "O horário selecionado já passou"
        };
      }
      const maxDelay = 24 * 60 * 60 * 1e3;
      if (targetDateTime.getTime() - now.getTime() > maxDelay) {
        return {
          success: false,
          message: "O horário não pode ser mais de 24 horas no futuro"
        };
      }
      for (const actionConfig of eventData.actions) {
        const action = actionRegistry.get(actionConfig.type);
        if (!action) {
          return {
            success: false,
            message: `Action tipo "${actionConfig.type}" não encontrada`
          };
        }
        const validation = action.validate?.(actionConfig);
        if (validation && !validation.valid) {
          return {
            success: false,
            message: validation.error || "Action inválida"
          };
        }
      }
      const updatedEvent = {
        ...eventData,
        id: eventId,
        createdAt: savedCreatedAt,
        targetDateTime
      };
      await this.scheduleEvent(updatedEvent);
      this.events.set(eventId, updatedEvent);
      return {
        success: true,
        event: updatedEvent,
        message: "Evento modificado com sucesso"
      };
    } catch (error) {
      console.error("❌ Erro ao atualizar evento:", error);
      return {
        success: false,
        message: "Erro ao atualizar evento"
      };
    }
  }
  async cancelEvent(eventId) {
    try {
      const event = this.events.get(eventId);
      if (!event) {
        return {
          success: false,
          message: "Evento não encontrado"
        };
      }
      const timer = this.eventTimers.get(eventId);
      if (timer) {
        clearTimeout(timer);
        this.eventTimers.delete(eventId);
      }
      const repeatTimer = this.repeatTimers.get(eventId);
      if (repeatTimer) {
        clearTimeout(repeatTimer);
        this.repeatTimers.delete(eventId);
      }
      for (const actionConfig of event.actions) {
        const action = actionRegistry.get(actionConfig.type);
        if (action && action.cancel) {
          try {
            await action.cancel(actionConfig);
          } catch (error) {
            console.error(`Erro ao cancelar ${action.name}:`, error);
          }
        }
      }
      this.events.delete(eventId);
      return {
        success: true,
        message: "Evento cancelado com sucesso"
      };
    } catch (error) {
      console.error("❌ Erro ao cancelar evento:", error);
      return {
        success: false,
        message: "Erro ao cancelar evento"
      };
    }
  }
  getEvent(eventId) {
    return this.events.get(eventId);
  }
  getAllEvents() {
    return Array.from(this.events.values());
  }
  deleteEvent(eventId) {
    const event = this.events.get(eventId);
    if (event) {
      const timer = this.eventTimers.get(eventId);
      if (timer) clearTimeout(timer);
      const repeatTimer = this.repeatTimers.get(eventId);
      if (repeatTimer) clearTimeout(repeatTimer);
      this.events.delete(eventId);
      this.eventTimers.delete(eventId);
      this.repeatTimers.delete(eventId);
      return true;
    }
    return false;
  }
}
const eventManager = new EventManager();
actionRegistry.register(shutdownAction);
actionRegistry.register(restartAction);
let mainWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 550,
    show: false,
    frame: false,
    backgroundColor: "#1a1a1a",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.sleep-schedule.app");
  electron.app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  electron.ipcMain.handle("create-event", async (_, eventData) => {
    return await eventManager.createEvent(eventData);
  });
  electron.ipcMain.handle("cancel-event", async (_, eventId) => {
    return await eventManager.cancelEvent(eventId);
  });
  electron.ipcMain.handle("get-event", async (_, eventId) => {
    return eventManager.getEvent(eventId);
  });
  electron.ipcMain.handle("get-all-events", async () => {
    return eventManager.getAllEvents();
  });
  electron.ipcMain.handle("update-event", async (_, eventId, eventData) => {
    return await eventManager.updateEvent(eventId, eventData);
  });
  electron.ipcMain.handle("delete-event", async (_, eventId) => {
    const deleted = eventManager.deleteEvent(eventId);
    return { success: deleted, message: deleted ? "Evento deletado" : "Evento não encontrado" };
  });
  electron.ipcMain.handle("schedule-shutdown", async (_, targetTime) => {
    const date = new Date(targetTime);
    const event = await eventManager.createEvent({
      title: "Desligar",
      time: date.toTimeString().substring(0, 5),
      actions: [{ id: `shutdown-${Date.now()}`, type: "shutdown" }]
    });
    return {
      success: event.success,
      message: event.message
    };
  });
  electron.ipcMain.handle("cancel-shutdown", async () => {
    const events = eventManager.getAllEvents();
    const shutdownEvents = events.filter((e) => e.actions.some((a) => a.type === "shutdown"));
    if (shutdownEvents.length === 0) {
      return { success: false, message: "Nenhum desligamento agendado" };
    }
    const result = await eventManager.cancelEvent(shutdownEvents[0].id);
    return result;
  });
  electron.ipcMain.handle("get-scheduled-time", () => {
    const events = eventManager.getAllEvents();
    const hasShutdown = events.some((e) => e.actions.some((a) => a.type === "shutdown"));
    return hasShutdown ? "active" : null;
  });
  electron.ipcMain.handle("window-close", () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });
  electron.ipcMain.handle("window-minimize", () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("before-quit", () => {
});
