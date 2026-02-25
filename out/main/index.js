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
const execAsync = util.promisify(child_process.exec);
let mainWindow = null;
let shutdownTimer = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 500,
    height: 600,
    minWidth: 450,
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
function calculateShutdownDelay(targetTime) {
  const now = /* @__PURE__ */ new Date();
  const delay = targetTime.getTime() - now.getTime();
  return Math.max(0, delay);
}
async function scheduleShutdown(targetTime) {
  try {
    console.log("🚀 INÍCIO: scheduleShutdown chamado");
    console.log(`   Horário recebido: ${targetTime.toISOString()}`);
    if (shutdownTimer) {
      console.log(`   ⚠️ Timer anterior encontrado (ID: ${shutdownTimer}), cancelando...`);
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
      console.log("⏹️ Timer anterior cancelado");
    } else {
      console.log("   ✅ Nenhum timer anterior encontrado");
    }
    const delay = calculateShutdownDelay(targetTime);
    const delayInSeconds = Math.floor(delay / 1e3);
    const delayInMinutes = Math.floor(delayInSeconds / 60);
    const delayInHours = Math.floor(delayInMinutes / 60);
    console.log("📅 Agendando desligamento:");
    console.log(`   Horário alvo: ${targetTime.toLocaleString("pt-BR")}`);
    console.log(`   Delay: ${delayInHours}h ${delayInMinutes % 60}m ${delayInSeconds % 60}s (${delayInSeconds} segundos / ${delay} ms)`);
    if (delay === 0) {
      console.log("❌ ERRO: O horário selecionado já passou");
      return { success: false, message: "O horário selecionado já passou" };
    }
    const maxDelay = 24 * 60 * 60 * 1e3;
    if (delay > maxDelay) {
      console.log("❌ ERRO: Horário excede o limite de 24 horas");
      return { success: false, message: "O horário não pode ser mais de 24 horas no futuro" };
    }
    console.log(`   ⏰ Criando timer com delay de ${delay}ms...`);
    shutdownTimer = setTimeout(async () => {
      console.log("🔄 Executando desligamento agora...");
      console.log(`   Timer executado! ID: ${shutdownTimer}`);
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
        console.log(`💻 Executando comando: ${command}`);
        await execAsync(command);
        console.log("✅ Comando de desligamento executado com sucesso");
      } catch (error) {
        console.error("❌ Erro ao desligar o computador:", error);
        mainWindow?.webContents.send("shutdown-error", {
          message: "Erro ao executar o desligamento. Verifique as permissões."
        });
      }
    }, delay);
    console.log(`✅ Desligamento agendado com sucesso!`);
    console.log(`   Timer ID: ${shutdownTimer}`);
    console.log(`   Timer ativo: ${shutdownTimer !== null}`);
    console.log(`   Tipo do timer: ${typeof shutdownTimer}`);
    return {
      success: true,
      message: `Desligamento agendado para ${targetTime.toLocaleString("pt-BR")}`
    };
  } catch (error) {
    console.error("❌ Erro ao agendar desligamento:", error);
    return {
      success: false,
      message: "Erro ao agendar o desligamento"
    };
  }
}
async function checkWindowsShutdownScheduled() {
  if (process.platform !== "win32") {
    return false;
  }
  try {
    await execAsync("shutdown /a", { timeout: 2e3 });
    console.log("ℹ️ Verificação: Havia um shutdown agendado no Windows (foi cancelado na verificação)");
    return true;
  } catch (error) {
    if (error.code === 1116) {
      console.log("ℹ️ Verificação: Nenhum shutdown agendado no Windows");
      return false;
    }
    console.log(`ℹ️ Verificação: Erro ao verificar shutdown (código ${error.code})`);
    return false;
  }
}
function cancelShutdown() {
  try {
    if (shutdownTimer) {
      console.log(`⏹️ Cancelando timer ID: ${shutdownTimer}`);
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
      console.log("⏹️ Timer de desligamento cancelado (Node.js)");
      if (process.platform === "win32") {
        checkWindowsShutdownScheduled().then((hasScheduled) => {
          if (hasScheduled) {
            child_process.exec("shutdown /a", (error) => {
              if (error) {
                console.log("⚠️ Não foi possível cancelar shutdown do Windows (pode não estar agendado)");
              } else {
                console.log("✅ Shutdown do Windows cancelado");
              }
            });
          } else {
            console.log("ℹ️ Nenhum shutdown agendado no Windows (apenas timer do Node.js foi cancelado)");
          }
        }).catch(() => {
          console.log("ℹ️ Verificação de shutdown do Windows ignorada");
        });
      }
      return { success: true, message: "Desligamento cancelado com sucesso" };
    }
    console.log("⚠️ Nenhum desligamento agendado para cancelar");
    return { success: false, message: "Nenhum desligamento agendado" };
  } catch (error) {
    console.error("❌ Erro ao cancelar desligamento:", error);
    return { success: false, message: "Erro ao cancelar o desligamento" };
  }
}
electron.app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.sleep-schedule.app");
  electron.app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  electron.ipcMain.handle("schedule-shutdown", async (_, targetTime) => {
    const date = new Date(targetTime);
    return await scheduleShutdown(date);
  });
  electron.ipcMain.handle("cancel-shutdown", () => {
    return cancelShutdown();
  });
  electron.ipcMain.handle("get-scheduled-time", () => {
    const hasTimer = shutdownTimer !== null;
    console.log(`🔍 Verificando timer: ${hasTimer ? "ATIVO" : "INATIVO"} (ID: ${shutdownTimer})`);
    return shutdownTimer ? "active" : null;
  });
  electron.ipcMain.handle("check-windows-shutdown", async () => {
    if (process.platform !== "win32") {
      return { scheduled: false, message: "Apenas Windows suporta verificação de shutdown do sistema" };
    }
    const hasScheduled = await checkWindowsShutdownScheduled();
    return {
      scheduled: hasScheduled,
      message: hasScheduled ? "Há um shutdown agendado no Windows" : "Nenhum shutdown agendado no Windows"
    };
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
