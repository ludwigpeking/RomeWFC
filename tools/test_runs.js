// Test runs of the settlement with so many snapshots over its days, with headless Chrome driving
// a built copy of the app (npx vite build --base ./ --outDir dist):
//   node tools/test_runs.js [runName ...]      (--index: only the page of what is on the disk)
// Every run lives its days with nothing drawn; at each snapshot the town is drawn and
// photographed from one fixed place, once as it is and once under each data layer asked for,
// and its numbers are taken; at the end the town is saved as a run the app can load:
//   tools/tests/<run>/<layer>/day_00150.jpg ...
//   tools/tests/<run>/numbers.jsonl      one line for each snapshot: day, numbers, what the city did
//   tools/tests/index.html               the snapshots of all runs side by side, day by day
//   tools/runs/<run>.json                the town at its last day (and index.json, the list for the app)
// Settings by the environment: ROME_PAGE_ADDRESS (default: dist next to tools),
// ROME_DEBUGGING_PORT, ROME_TEST_DAYS (default 3000), ROME_FRAME_COUNT (snapshots, default 20),
// ROME_PICTURE_WIDTH and ROME_PICTURE_HEIGHT (default 1280 by 720).
// The parameter experiments (tools/experiments.js) are among the runs: exp_baseline, exp_<name>_low, exp_<name>_high.
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const childProcess = require("child_process");

const PROJECT_FOLDER = path.join(__dirname, "..");
const TEST_FOLDER = path.join(__dirname, "tests");
const PAGE_ADDRESS = process.env.ROME_PAGE_ADDRESS || "file://" + path.join(PROJECT_FOLDER, "dist", "index.html");
const DEBUGGING_PORT = Number(process.env.ROME_DEBUGGING_PORT || 9420);
const RUN_FOLDER = path.join(__dirname, "runs");
const DAY_COUNT = Number(process.env.ROME_TEST_DAYS || 3000);
const FRAME_COUNT = Number(process.env.ROME_FRAME_COUNT || 20);
const DAYS_BETWEEN_SNAPSHOTS = Math.max(1, Math.round(DAY_COUNT / FRAME_COUNT));
const PICTURE_WIDTH = Number(process.env.ROME_PICTURE_WIDTH || 1280);
const PICTURE_HEIGHT = Number(process.env.ROME_PICTURE_HEIGHT || 720);
// the data layers pictured at every snapshot (ROME_LAYERS, e.g. "none" alone for a quick run)
const LAYERS = (process.env.ROME_LAYERS || "none location height money").split(/[\s,]+/).filter(Boolean);
// a call to the page that takes longer than this has lost its renderer (the Mac's headless
// Chrome died twice at day 2700 of a dense town and node waited for ever): the run fails instead
const MINUTES_A_CALL_MAY_TAKE = Number(process.env.ROME_CALL_MINUTES || 10);
const CAMERA = { angle: 0.6, distance: 2.3, elevation: 0.62, fieldOfView: 30 };

// The runs: the parameters the app starts with, on both grounds, several seeds; the first town
// again with the random fortune of the households off, at 30% (the default) and at 50%
const RUNS = {
  sim_square_4001: { ground: "square", seed: 4001, pointsAlongASide: 60, ringCount: 14, parameters: { chanceOfAFortuneEachDay: 0 } },
  sim_square_4001_fortune30: { ground: "square", seed: 4001, pointsAlongASide: 60, ringCount: 14, parameters: {} },
  sim_square_4001_fortune50: { ground: "square", seed: 4001, pointsAlongASide: 60, ringCount: 14, parameters: { fortuneShareOfWealthAtMost: 0.5 } },
  sim_square_4002: { ground: "square", seed: 4002, pointsAlongASide: 60, ringCount: 14, parameters: {} },
  sim_irregular_4003: { ground: "largeIrregular", seed: 4003, pointsAlongASide: 60, ringCount: 14, parameters: {} },
  sim_irregular_4004: { ground: "largeIrregular", seed: 4004, pointsAlongASide: 60, ringCount: 14, parameters: {} },
  sim_square_4005: { ground: "square", seed: 4005, pointsAlongASide: 80, ringCount: 18, parameters: {} },
  // the baseline of the rules of a day (the same ground as the experiments), to set a changed rule
  // against the day before: 2026-10-12, the portal bonus on the whole property, streets at twice
  // the vacant land (was four times), no way-out rule
  base_1012: { ground: "square", seed: 4005, pointsAlongASide: 80, ringCount: 18, parameters: {} },
};
Object.assign(RUNS, require("./experiments").experimentRuns(), require("./experiments").claimRuns());

// The list of the runs for the app (tools/run_index.js)
function writeRunIndex() {
  return require("./run_index").writeRunIndex(require("./experiments").EXPERIMENTS);
}

function wait(milliseconds) {
  return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
}

function dayFileName(day) {
  return "day_" + String(day).padStart(5, "0") + ".jpg";
}

// The page that shows the snapshots of every run found in the test folder
function writeIndexPage() {
  const runs = fs.readdirSync(TEST_FOLDER).filter(function (name) {
    return fs.existsSync(path.join(TEST_FOLDER, name, "numbers.jsonl"));
  }).map(function (name) {
    const snapshots = fs.readFileSync(path.join(TEST_FOLDER, name, "numbers.jsonl"), "utf8").split("\n").filter(Boolean).map(function (line) { return JSON.parse(line); });
    return { name: name, snapshots: snapshots };
  });
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Test runs</title>
<style>
  body { margin: 0; background: #1b1a18; color: #ece7dc; font: 14px/1.4 "Segoe UI", sans-serif; }
  header { position: sticky; top: 0; background: #1b1a18; padding: 10px 16px; border-bottom: 1px solid #3a3833; z-index: 2; }
  header input[type=range] { width: 520px; vertical-align: middle; }
  header button { background: #33312c; color: inherit; border: 1px solid #55524a; padding: 3px 10px; cursor: pointer; }
  header button.active { background: #c9963a; color: #1b1a18; }
  #runs { display: grid; grid-template-columns: repeat(auto-fill, minmax(560px, 1fr)); gap: 12px; padding: 12px 16px; }
  .run { background: #24231f; border: 1px solid #3a3833; }
  .run img { width: 100%; height: auto; display: block; }
  .run h2 { font-size: 15px; margin: 8px 10px 2px; }
  .run table { margin: 4px 10px 10px; border-collapse: collapse; }
  .run td { padding: 1px 14px 1px 0; }
  .run td.value { text-align: right; font-variant-numeric: tabular-nums; color: #f1c66f; }
</style>
</head>
<body>
<header>
  Day <b id="dayText"></b>
  <input id="daySlider" type="range" min="0" value="0" step="1">
  <button id="playButton">Play</button>
  <span id="layerButtons"></span>
</header>
<div id="runs"></div>
<script>
const RUNS = ${JSON.stringify(runs)};
const LAYERS = ${JSON.stringify(LAYERS)};
const NUMBERS_SHOWN = [["households", "households"], ["hutBlocks", "huts"], ["houseBlocks", "houses"], ["houseBlocksWithClassicalFloors", "houses with classical floors"],
  ["classicalBlocks", "classical blocks"], ["towerBlocks", "towers"], ["gardenPoints", "gardens"], ["roofTerraces", "roof terraces"], ["meanLevelsOfABlock", "mean levels"],
  ["mostLevelsOfABlock", "most levels"], ["acquisitions", "properties bought"], ["buildingsBrokenThrough", "buildings broken through"], ["meanMoneyOfAHousehold", "mean money of a household"], ["householdsInDebt", "households in debt"], ["landUsePrivate", "land use: private"], ["landUseStreet", "land use: street"], ["landUseOpen", "land use: open space"], ["landUsePublic", "land use: public buildings"], ["roadPoints", "street points"], ["busyStreetPoints", "busy street points"], ["streetsTaken", "streets bought and built on"], ["fortunesWon", "fortunes won"], ["fortunesLost", "fortunes lost"], ["treasury", "treasury of the city"]];
let layerName = "none";
let snapshotIndex = 0;
let playTimer = null;
const longestRun = Math.max.apply(null, RUNS.map(function (run) { return run.snapshots.length; }));
const slider = document.getElementById("daySlider");
slider.max = String(longestRun - 1);
// The cards are made once; a new day only changes the picture and the numbers in them, so that
// the page keeps its height and its place while it plays
const cardOfRun = RUNS.map(function (run) {
  const card = document.createElement("div");
  card.className = "run";
  const picture = document.createElement("img");
  picture.width = 1280;
  picture.height = 720;
  const heading = document.createElement("h2");
  const table = document.createElement("table");
  card.appendChild(picture);
  card.appendChild(heading);
  card.appendChild(table);
  document.getElementById("runs").appendChild(card);
  return { picture: picture, heading: heading, table: table };
});
function show() {
  let dayShown = 0;
  RUNS.forEach(function (run, runNumber) {
    const snapshot = run.snapshots[Math.min(snapshotIndex, run.snapshots.length - 1)];
    dayShown = Math.max(dayShown, snapshot.day);
    const card = cardOfRun[runNumber];
    card.picture.src = run.name + "/" + layerName + "/day_" + String(snapshot.day).padStart(5, "0") + ".jpg";
    card.picture.onerror = function () { card.picture.removeAttribute("src"); card.picture.alt = "no " + layerName + " picture of this run"; };
    card.heading.textContent = run.name + " \u00b7 day " + snapshot.day;
    card.table.innerHTML = NUMBERS_SHOWN.map(function (entry) {
      const value = entry[0] === "treasury" ? snapshot.treasury : snapshot.statistics[entry[0]];
      return value === undefined ? "" : "<tr><td>" + entry[1] + "</td><td class='value'>" + value.toLocaleString("en-US") + "</td></tr>";
    }).join("");
  });
  document.getElementById("dayText").textContent = String(dayShown);
}
LAYERS.forEach(function (name) {
  const button = document.createElement("button");
  button.textContent = name === "none" ? "town" : name;
  button.className = name === layerName ? "active" : "";
  button.addEventListener("click", function () {
    layerName = name;
    document.querySelectorAll("#layerButtons button").forEach(function (other) { other.className = other === button ? "active" : ""; });
    show();
  });
  document.getElementById("layerButtons").appendChild(button);
});
slider.addEventListener("input", function () { snapshotIndex = Number(slider.value); show(); });
document.getElementById("playButton").addEventListener("click", function () {
  if (playTimer !== null) {
    clearInterval(playTimer);
    playTimer = null;
    this.textContent = "Play";
    return;
  }
  this.textContent = "Stop";
  playTimer = setInterval(function () {
    snapshotIndex = (snapshotIndex + 1) % longestRun;
    slider.value = String(snapshotIndex);
    show();
  }, 350);
});
show();
</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(TEST_FOLDER, "index.html"), page);
}

async function main() {
  if (process.argv[2] === "--index") {
    writeIndexPage();
    console.log(writeRunIndex() + " runs listed in tools/runs/index.json");
    return;
  }
  const runNames = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(RUNS);
  const chromePath = process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const browser = childProcess.spawn(chromePath, [
    "--headless=new", "--remote-debugging-port=" + DEBUGGING_PORT, "--window-size=" + PICTURE_WIDTH + "," + PICTURE_HEIGHT,
    "--user-data-dir=" + path.join(os.tmpdir(), "rome-test-chrome-" + DEBUGGING_PORT), "--ignore-gpu-blocklist", "--enable-gpu-rasterization",
    "--allow-file-access-from-files", "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  let socket = null;
  let nextMessageId = 1;
  const pendingReplies = new Map();
  function send(method, parameters) {
    const messageId = nextMessageId++;
    socket.send(JSON.stringify({ id: messageId, method: method, params: parameters || {} }));
    return new Promise(function (resolve, reject) { pendingReplies.set(messageId, { resolve: resolve, reject: reject }); });
  }
  async function evaluate(expression) {
    const reply = await Promise.race([
      send("Runtime.evaluate", { expression: expression, returnByValue: true, awaitPromise: true }),
      wait(MINUTES_A_CALL_MAY_TAKE * 60000).then(function () { throw new Error("no answer from the page in " + MINUTES_A_CALL_MAY_TAKE + " minutes: " + expression.slice(0, 80)); }),
    ]);
    if (reply.exceptionDetails) {
      throw new Error(expression.slice(0, 80) + ": " + (reply.exceptionDetails.exception ? reply.exceptionDetails.exception.description : reply.exceptionDetails.text));
    }
    return reply.result.value;
  }
  async function takePicture(fileName) {
    await evaluate("new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); })");
    const reply = await send("Page.captureScreenshot", { format: "jpeg", quality: 86 });
    fs.mkdirSync(path.dirname(fileName), { recursive: true });
    fs.writeFileSync(fileName, Buffer.from(reply.data, "base64"));
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
    await send("Emulation.setDeviceMetricsOverride", { width: PICTURE_WIDTH, height: PICTURE_HEIGHT, deviceScaleFactor: 1, mobile: false });
    // the page is loaded afresh for every run: a town's geometry lingers in the page after it,
    // and over several runs the browser grew to many gigabytes
    async function loadThePage() {
      await send("Page.navigate", { url: PAGE_ADDRESS });
      for (let attempt = 0; attempt < 160; attempt++) {
        await wait(250);
        const isReady = await evaluate("Boolean(window.rome)").catch(function () { return false; });
        if (isReady) { break; }
      }
      await wait(1500);
    }

    for (const runName of runNames) {
      const run = RUNS[runName];
      await loadThePage();
      const runFolder = path.join(TEST_FOLDER, runName);
      fs.rmSync(runFolder, { recursive: true, force: true });
      fs.mkdirSync(runFolder, { recursive: true });
      const numbersLog = fs.createWriteStream(path.join(runFolder, "numbers.jsonl"));
      const startTime = Date.now();
      console.log(runName + ": " + DAY_COUNT + " days, a snapshot every " + DAYS_BETWEEN_SNAPSHOTS);
      const bounds = await evaluate("rome.filmPrepare(" + [JSON.stringify(run.ground), run.seed, run.pointsAlongASide, run.ringCount, JSON.stringify(run.parameters)].join(",") + ")");
      await evaluate("rome.filmFaintOpacity(0.05)");
      await evaluate("rome.filmPeople(0, false)");
      const distance = bounds.reach * CAMERA.distance;
      const across = distance * Math.cos(CAMERA.elevation);
      await evaluate("rome.view(" + [bounds.centreX + across * Math.sin(CAMERA.angle), distance * Math.sin(CAMERA.elevation), bounds.centreZ + across * Math.cos(CAMERA.angle),
        bounds.centreX, 2, bounds.centreZ, CAMERA.fieldOfView].join(",") + ")");
      for (let day = DAYS_BETWEEN_SNAPSHOTS; day <= DAY_COUNT; day += DAYS_BETWEEN_SNAPSHOTS) {
        await evaluate("(function () { rome.settleOn(" + DAYS_BETWEEN_SNAPSHOTS + "); return true; })()");
        await evaluate("rome.rebuild()");
        const result = await evaluate("rome.filmAdvance(0)");
        for (const layerName of LAYERS) {
          await evaluate("rome.filmLayer(" + JSON.stringify(layerName) + ")");
          await takePicture(path.join(runFolder, layerName, dayFileName(day)));
        }
        numbersLog.write(JSON.stringify({ day: result.day, treasury: result.treasury, statistics: result.statistics, events: result.events }) + "\n");
        if (day % 500 === 0) {
          const statistics = result.statistics;
          console.log("  day " + day + " · " + statistics.households + " households · huts " + statistics.hutBlocks + " · houses " + statistics.houseBlocks +
            " · with classical floors " + statistics.houseBlocksWithClassicalFloors + " · classical " + statistics.classicalBlocks + " · towers " + statistics.towerBlocks +
            " · gardens " + statistics.gardenPoints + " · mean levels " + statistics.meanLevelsOfABlock + " · " + Math.round((Date.now() - startTime) / 1000) + " s");
        }
      }
      await new Promise(function (resolve) { numbersLog.end(resolve); });
      // the town at its last day, saved for the app
      const result = await evaluate("rome.saveRun()");
      const statistics = result.statistics;
      const label = runName + " \u00b7 seed " + run.seed + " \u00b7 " + (run.ground === "square" ? "square " + run.pointsAlongASide : "irregular " + run.ringCount) +
        " \u00b7 day " + DAY_COUNT + " \u00b7 " + statistics.households + " households \u00b7 " + statistics.towerBlocks + " towers";
      fs.mkdirSync(RUN_FOLDER, { recursive: true });
      fs.writeFileSync(path.join(RUN_FOLDER, runName + ".json"), JSON.stringify({
        name: runName, label: label, ground: run.ground, seed: run.seed, dayCount: DAY_COUNT, parameters: result.parameters,
        statistics: statistics, monuments: result.monuments, groundSize: result.groundSize, saved: result.saved,
      }));
      console.log(runName + " done in " + Math.round((Date.now() - startTime) / 60000) + " min; saved as tools/runs/" + runName + ".json");
    }
    writeIndexPage();
    writeRunIndex();
  } finally {
    if (socket !== null) {
      socket.close();
    }
    browser.kill();
  }
}

module.exports = { RUNS: RUNS };

if (require.main === module) {
  main().catch(function (error) {
    console.error(error);
    process.exit(1);
  });
}
