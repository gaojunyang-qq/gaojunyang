import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appUrl = process.env.APP_URL || "http://localhost:4173";
const screenshotDir = join(rootDir, ".tmp", "screenshots");

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

class CDPClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.id = 0;
    this.pending = new Map();
    this.waiters = new Map();
    this.errors = [];
  }

  async connect() {
    this.socket = new WebSocket(this.webSocketUrl);
    this.socket.addEventListener("message", (event) => this.handleMessage(event));
    this.socket.addEventListener("error", (event) => {
      this.errors.push(`WebSocket error: ${event.message || "unknown"}`);
    });
    await once(this.socket, "open");
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id && this.pending.has(message.id)) {
      const { resolve: resolvePending, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(`${message.error.message || "CDP error"}`));
      } else {
        resolvePending(message.result || {});
      }
      return;
    }

    if (message.method === "Runtime.exceptionThrown") {
      const detail = message.params.exceptionDetails;
      this.errors.push(detail.exception?.description || detail.text || "Runtime exception");
    }

    if (message.method === "Log.entryAdded" && message.params.entry?.level === "error") {
      this.errors.push(message.params.entry.text);
    }

    const waiter = this.waiters.get(message.method);
    if (waiter) {
      clearTimeout(waiter.timer);
      this.waiters.delete(message.method);
      waiter.resolve(message.params || {});
    }
  }

  send(method, params = {}) {
    const id = (this.id += 1);
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolvePending, reject) => {
      this.pending.set(id, { resolve: resolvePending, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timed out waiting for ${method}`));
        }
      }, 8000);
    });
  }

  waitFor(method, timeout = 8000) {
    return new Promise((resolveWaiter, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(method);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeout);
      this.waiters.set(method, { resolve: resolveWaiter, timer });
    });
  }

  close() {
    this.socket?.close();
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  child.kill();
  await Promise.race([once(child, "exit"), sleep(1400)]).catch(() => {});
}

async function fileExists(path) {
  try {
    const { access } = await import("node:fs/promises");
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findChrome() {
  for (const candidate of chromeCandidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  throw new Error("Chrome or Edge was not found. Set CHROME_PATH to run the browser smoke test.");
}

async function waitForHttp(url, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
    } catch {
      await sleep(180);
    }
  }
  return false;
}

async function ensureServer() {
  if (await waitForHttp(appUrl, 1200)) {
    return undefined;
  }

  const server = spawn(process.execPath, ["server.mjs"], {
    cwd: rootDir,
    env: { ...process.env, PORT: "4173" },
    stdio: "pipe",
  });

  if (!(await waitForHttp(appUrl, 8000))) {
    await stopProcess(server);
    throw new Error(`Local server did not respond at ${appUrl}`);
  }

  return server;
}

async function startChrome() {
  const chromePath = await findChrome();
  const debuggingPort = 9300 + Math.floor(Math.random() * 600);
  const userDataDir = await mkdtemp(join(tmpdir(), "starway-chrome-"));
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-features=Translate,MediaRouter",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-allow-origins=*",
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const versionUrl = `http://127.0.0.1:${debuggingPort}/json/version`;
  const ready = await waitForHttp(versionUrl, 10000);
  if (!ready) {
    chrome.kill();
    await rm(userDataDir, { recursive: true, force: true });
    throw new Error("Chrome remote debugging did not start.");
  }

  return { chrome, debuggingPort, userDataDir };
}

async function createPage(debuggingPort) {
  const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/new`, { method: "PUT" });
  const target = await response.json();
  const cdp = new CDPClient(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Log.enable");
  return cdp;
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }

  return result.result?.value;
}

async function navigate(cdp, viewport) {
  await cdp.send("Emulation.setDeviceMetricsOverride", viewport);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: Boolean(viewport.mobile) });
  const loaded = cdp.waitFor("Page.loadEventFired", 9000);
  await cdp.send("Page.navigate", { url: appUrl });
  await loaded;
  await sleep(500);
}

async function capture(cdp, filename) {
  await mkdir(dirname(filename), { recursive: true });
  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(filename, Buffer.from(screenshot.data, "base64"));
}

async function assertPageReady(cdp) {
  const state = await evaluate(
    cdp,
    `(() => {
      const canvas = document.querySelector("#gameCanvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const data = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
      return {
        title: document.title,
        startVisible: !document.querySelector("#startScreen").hidden,
        gameOverHidden: document.querySelector("#gameOverScreen").hidden,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        pixelSum: data[0] + data[1] + data[2] + data[3],
        controls: Boolean(document.querySelector("#leftControl") && document.querySelector("#rightControl")),
      };
    })()`,
  );

  if (state.title !== "星轨闪避") {
    throw new Error(`Unexpected page title: ${state.title}`);
  }
  if (!state.startVisible || !state.gameOverHidden) {
    throw new Error("Initial screens are not in the expected state.");
  }
  if (state.canvasWidth <= 0 || state.canvasHeight <= 0 || state.pixelSum <= 0) {
    throw new Error("Canvas did not render visible pixels.");
  }
  if (!state.controls) {
    throw new Error("Touch controls were not found.");
  }
}

async function playDesktop(cdp) {
  await evaluate(cdp, `document.querySelector("#startButton").click()`);
  await sleep(800);

  const rect = await evaluate(
    cdp,
    `(() => {
      const rect = document.querySelector("#gameCanvas").getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    })()`,
  );

  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: rect.left + rect.width * 0.28,
    y: rect.top + rect.height * 0.72,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await sleep(240);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await sleep(700);

  const state = await evaluate(
    cdp,
    `(() => ({
      startHidden: document.querySelector("#startScreen").hidden,
      score: Number(document.querySelector("#scoreValue").textContent),
      best: Number(document.querySelector("#bestValue").textContent)
    }))()`,
  );

  if (!state.startHidden || state.score <= 0 || Number.isNaN(state.best)) {
    throw new Error("Desktop play interaction did not advance the game state.");
  }

  await evaluate(cdp, `endGame()`);
  await sleep(180);
  const overState = await evaluate(
    cdp,
    `(() => ({
      gameOverVisible: !document.querySelector("#gameOverScreen").hidden,
      finalScore: Number(document.querySelector("#finalScore").textContent),
      restartReady: !document.querySelector("#restartButton").disabled
    }))()`,
  );

  if (!overState.gameOverVisible || Number.isNaN(overState.finalScore) || !overState.restartReady) {
    throw new Error("Game over screen did not appear correctly.");
  }

  await evaluate(cdp, `document.querySelector("#restartButton").click()`);
  await sleep(320);
  const restartState = await evaluate(
    cdp,
    `(() => ({
      gameOverHidden: document.querySelector("#gameOverScreen").hidden,
      score: Number(document.querySelector("#scoreValue").textContent)
    }))()`,
  );

  if (!restartState.gameOverHidden || Number.isNaN(restartState.score)) {
    throw new Error("Restart button did not return to active play.");
  }
}

async function playMobile(cdp) {
  await evaluate(cdp, `document.querySelector("#startButton").click()`);
  await sleep(500);

  const rect = await evaluate(
    cdp,
    `(() => {
      const rect = document.querySelector("#gameCanvas").getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    })()`,
  );

  const y = rect.top + rect.height * 0.7;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: rect.left + rect.width * 0.6, y, radiusX: 2, radiusY: 2, force: 1, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: rect.left + rect.width * 0.3, y, radiusX: 2, radiusY: 2, force: 1, id: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(600);

  const state = await evaluate(
    cdp,
    `(() => ({
      score: Number(document.querySelector("#scoreValue").textContent),
      frameWidth: document.querySelector(".game-frame").getBoundingClientRect().width,
      bodyWidth: document.body.getBoundingClientRect().width
    }))()`,
  );

  if (state.score <= 0) {
    throw new Error("Mobile touch interaction did not advance the game state.");
  }
  if (state.frameWidth > state.bodyWidth + 1) {
    throw new Error("Mobile layout overflows the viewport.");
  }
}

async function run() {
  const server = await ensureServer();
  const chromeRuntime = await startChrome();
  const pages = [];

  try {
    const desktop = await createPage(chromeRuntime.debuggingPort);
    pages.push(desktop);
    await navigate(desktop, {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await assertPageReady(desktop);
    await playDesktop(desktop);
    await capture(desktop, join(screenshotDir, "desktop.png"));

    const mobile = await createPage(chromeRuntime.debuggingPort);
    pages.push(mobile);
    await navigate(mobile, {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await assertPageReady(mobile);
    await playMobile(mobile);
    await capture(mobile, join(screenshotDir, "mobile.png"));

    const errors = pages.flatMap((page) => page.errors);
    if (errors.length > 0) {
      throw new Error(`Browser console errors:\n${errors.join("\n")}`);
    }

    console.log("Browser smoke test passed.");
    console.log(`Screenshots saved to ${screenshotDir}`);
  } finally {
    for (const page of pages) {
      page.close();
    }
    await stopProcess(chromeRuntime.chrome);
    await rm(chromeRuntime.userDataDir, { recursive: true, force: true }).catch(() => {});
    if (server) {
      await stopProcess(server);
    }
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
