// Lives the two test towns (tools/test_runs.js: the same grounds, seeds and days) and saves them
// as runs the app can load from its Settle tab (tools/runs/test_001.json, test_002.json; the
// index of all the runs is written again). Headless Chrome drives a built copy of the app:
//   node tools/save_towns.js
// Settings by the environment: ROME_PAGE_ADDRESS (default: dist next to tools), ROME_DEBUGGING_PORT,
// ROME_TEST_DAYS (default 3000).
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const childProcess = require("child_process");

const PROJECT_FOLDER = path.join(__dirname, "..");
const RUN_FOLDER = path.join(__dirname, "runs");
const PAGE_ADDRESS = process.env.ROME_PAGE_ADDRESS || "file://" + path.join(PROJECT_FOLDER, "dist", "index.html");
const DEBUGGING_PORT = Number(process.env.ROME_DEBUGGING_PORT || 9430);
const DAY_COUNT = Number(process.env.ROME_TEST_DAYS || 3000);
const TOWNS = [
  { name: "test_001", ground: "square", seed: 3001, groundSize: { squarePointCount: 60, largeIrregularRingCount: 14 } },
  { name: "test_002", ground: "largeIrregular", seed: 3002, groundSize: { squarePointCount: 60, largeIrregularRingCount: 14 } },
];

function wait(milliseconds) {
  return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
}

async function main() {
  const chromePath = process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const browser = childProcess.spawn(chromePath, [
    "--headless=new", "--remote-debugging-port=" + DEBUGGING_PORT, "--window-size=1280,720",
    "--user-data-dir=" + path.join(os.tmpdir(), "rome-save-chrome-" + DEBUGGING_PORT), "--allow-file-access-from-files", "--no-first-run", "about:blank"], { stdio: "ignore" });
  let socket = null;
  let nextMessageId = 1;
  const pendingReplies = new Map();
  function send(method, parameters) {
    const messageId = nextMessageId++;
    socket.send(JSON.stringify({ id: messageId, method: method, params: parameters || {} }));
    return new Promise(function (resolve, reject) { pendingReplies.set(messageId, { resolve: resolve, reject: reject }); });
  }
  async function evaluate(expression) {
    const reply = await send("Runtime.evaluate", { expression: expression, returnByValue: true, awaitPromise: true });
    if (reply.exceptionDetails) {
      throw new Error(expression.slice(0, 80) + ": " + (reply.exceptionDetails.exception ? reply.exceptionDetails.exception.description : reply.exceptionDetails.text));
    }
    return reply.result.value;
  }
  try {
    for (let attempt = 0; attempt < 80 && socket === null; attempt++) {
      try {
        const targets = await (await fetch("http://localhost:" + DEBUGGING_PORT + "/json")).json();
        const pageTarget = targets.find(function (target) { return target.type === "page"; });
        socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
        await new Promise(function (resolve, reject) { socket.onopen = resolve; socket.onerror = reject; });
      } catch (error) {
        socket = null;
        await wait(250);
      }
    }
    socket.onmessage = function (event) {
      const message = JSON.parse(event.data);
      if (message.id && pendingReplies.has(message.id)) {
        const handlers = pendingReplies.get(message.id);
        pendingReplies.delete(message.id);
        if (message.error) { handlers.reject(new Error(message.error.message)); } else { handlers.resolve(message.result); }
      }
    };
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.navigate", { url: PAGE_ADDRESS });
    for (let attempt = 0; attempt < 160; attempt++) {
      await wait(250);
      const isReady = await evaluate("Boolean(window.rome)").catch(function () { return false; });
      if (isReady) { break; }
    }
    await wait(1500);
    fs.mkdirSync(RUN_FOLDER, { recursive: true });
    for (const town of TOWNS) {
      const startTime = Date.now();
      const result = await evaluate("rome.runSimulation(" + [JSON.stringify(town.ground), town.seed, DAY_COUNT, "{}", JSON.stringify(town.groundSize)].join(",") + ")");
      const statistics = result.statistics;
      const label = town.name + " \u00b7 seed " + town.seed + " \u00b7 " + (town.ground === "square" ? "square " + town.groundSize.squarePointCount : "irregular " + town.groundSize.largeIrregularRingCount) +
        " \u00b7 day " + DAY_COUNT + " \u00b7 " + statistics.households + " households \u00b7 " + statistics.towerBlocks + " towers";
      fs.writeFileSync(path.join(RUN_FOLDER, town.name + ".json"), JSON.stringify({
        name: town.name, label: label, ground: town.ground, seed: town.seed, dayCount: DAY_COUNT, parameters: result.parameters,
        statistics: statistics, monuments: result.monuments, groundSize: result.groundSize, saved: result.saved,
      }));
      console.log(label + " \u00b7 " + Math.round((Date.now() - startTime) / 1000) + " s");
    }
  } finally {
    if (socket !== null) {
      socket.close();
    }
    browser.kill();
  }
  // the list for the app: every run on the disk, the test towns first
  const savedRuns = fs.readdirSync(RUN_FOLDER).filter(function (fileName) {
    return /^[a-z]+_\d+\.json$/.test(fileName);
  }).sort(function (first, second) {
    const firstIsTest = first.startsWith("test_") ? 0 : 1;
    const secondIsTest = second.startsWith("test_") ? 0 : 1;
    return firstIsTest - secondIsTest || first.localeCompare(second);
  }).map(function (fileName) {
    const run = JSON.parse(fs.readFileSync(path.join(RUN_FOLDER, fileName), "utf8"));
    return { file: fileName, label: run.label };
  });
  fs.writeFileSync(path.join(RUN_FOLDER, "index.json"), JSON.stringify(savedRuns, null, 1));
  console.log(savedRuns.length + " runs listed in index.json");
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
