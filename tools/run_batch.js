// Runs many settlements one after another, each with its own parameters, with headless Chrome
// driving the app, and keeps for each its parameters, its numbers, its state and a picture:
//   node tools/run_batch.js [runCount] [dayCount] [firstRunNumber]
// Nothing is drawn while a settlement lives; its town is built once at its end. The results go
// to tools/runs:
//   run_001.json ...  one run: ground, seed, parameters, statistics, monuments, and the saved
//                     state of the town (the app loads it: SAVED RUNS in its toolbar)
//   run_001.jpg ...   the town at its end
//   index.json        the list of the runs for the app
//   runs.csv          one line for each run: parameters and statistics
// The app is the running one (npm run dev) or, with ROME_PAGE_ADDRESS set, a built copy of it.
//
// Further settings, by the environment:
//   ROME_RUN_PREFIX      the names of the runs begin with it (default "run": run_001 ...)
//   ROME_SQUARE_POINTS   points along a side of the square ground (default 30)
//   ROME_RINGS           rings of the large irregular ground (default 8)
//   ROME_SEED_BASE       the seed of run n is this plus n (default 1000)
//   ROME_RUN_NUMBERS     only these runs, as "1,2,5" (several batches can then share the work,
//                        each with its own ROME_DEBUGGING_PORT)
//   ROME_PLAIN_RUNS      the first so many runs keep the parameters the app starts with (default 0)
//   ROME_DEBUGGING_PORT  the port its Chrome listens on (default 9344)
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const childProcess = require("child_process");

const PAGE_ADDRESS = process.env.ROME_PAGE_ADDRESS || "http://localhost:5210/";
const DEBUGGING_PORT = Number(process.env.ROME_DEBUGGING_PORT || 9344);
const RUN_PREFIX = process.env.ROME_RUN_PREFIX || "run";
const GROUND_SIZE = { squarePointCount: Number(process.env.ROME_SQUARE_POINTS || 30), largeIrregularRingCount: Number(process.env.ROME_RINGS || 8) };
const SEED_BASE = Number(process.env.ROME_SEED_BASE || 1000);
const PLAIN_RUN_COUNT = Number(process.env.ROME_PLAIN_RUNS || 0);
const ONLY_RUN_NUMBERS = process.env.ROME_RUN_NUMBERS ? process.env.ROME_RUN_NUMBERS.split(",").map(Number) : null;
const PICTURE_WIDTH = 1600;
const PICTURE_HEIGHT = 900;

// The span each parameter is drawn from, evenly (or evenly over whole numbers); the ground is
// the square one and the large irregular one in turn.
const PARAMETER_SPANS = {
    landPriceScale: { least: 0.0002, most: 0.001, decimals: 5 },
    rentRateEachDay: { least: 0.0012, most: 0.003, decimals: 5 },
    requiredReturnEachDay: { least: 0.0018, most: 0.004, decimals: 5 },
    depreciationEachDay: { least: 0.0001, most: 0.0008, decimals: 5 },
    constructionCostGrowthPerLevel: { least: 1.1, most: 1.5 },
    managementLossPerCell: { least: 0.01, most: 0.12, decimals: 3 },
    acquisitionPremium: { least: 0.1, most: 0.6 },
    gardenRentBonus: { least: 0.05, most: 0.3 },
    shareOfFarmers: { least: 0.2, most: 0.8 },
    farmYieldEachDay: { least: 0.02, most: 0.12, decimals: 3 },
    journeysPerHouseholdEachDay: { least: 0.15, most: 0.6 },
    chanceOfAnArrivalEachDay: { least: 0.2, most: 0.8 },
    householdsForEachTower: { least: 60, most: 300, isWhole: true },
};

// a repeatable source of chance, so that a batch can be made again
function createChance(seed) {
    let state = seed >>> 0;
    return function () {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function drawParameters(chance) {
    const parameters = {};
    Object.keys(PARAMETER_SPANS).forEach(function (name) {
        const span = PARAMETER_SPANS[name];
        const value = span.least + chance() * (span.most - span.least);
        const scale = Math.pow(10, span.decimals === undefined ? 2 : span.decimals);
        parameters[name] = span.isWhole ? Math.round(value) : Math.round(value * scale) / scale;
    });
    return parameters;
}

function wait(milliseconds) {
    return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
}

async function main() {
    const runCount = Number(process.argv[2] || 100);
    const dayCount = Number(process.argv[3] || 1500);
    const firstRunNumber = Number(process.argv[4] || 1);
    const runDirectory = path.join(__dirname, "runs");
    fs.mkdirSync(runDirectory, { recursive: true });

    // the runs in the order they are made: the square ground first, then the irregular one, so
    // that the irregular ground is made only once
    const runs = [];
    for (let runNumber = 1; runNumber <= runCount; runNumber++) {
        const chance = createChance(7919 * runNumber + 13);
        runs.push({
            runNumber: runNumber, ground: runNumber % 2 === 1 ? "square" : "largeIrregular", seed: SEED_BASE + runNumber,
            parameters: runNumber <= PLAIN_RUN_COUNT ? {} : drawParameters(chance),
        });
    }
    runs.sort(function (first, second) {
        return first.ground === second.ground ? first.runNumber - second.runNumber : (first.ground === "square" ? -1 : 1);
    });

    const chromePath = process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "C:/Program Files/Google/Chrome/Application/chrome.exe";
    const browser = childProcess.spawn(chromePath, [
        "--headless=new", "--remote-debugging-port=" + DEBUGGING_PORT, "--window-size=" + PICTURE_WIDTH + "," + PICTURE_HEIGHT,
        "--user-data-dir=" + path.join(os.tmpdir(), "rome-wfc-batch-chrome-" + DEBUGGING_PORT), "--ignore-gpu-blocklist", "--allow-file-access-from-files", "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
        for (let attempt = 0; attempt < 60 && socket === null; attempt++) {
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
        await send("Page.navigate", { url: PAGE_ADDRESS });
        for (let attempt = 0; attempt < 120; attempt++) {
            await wait(250);
            const isReady = await evaluate("Boolean(window.rome)").catch(function () { return false; });
            if (isReady) { break; }
        }
        await wait(1000);
        await evaluate("rome.hideInterface()");

        for (const run of runs) {
            if (run.runNumber < firstRunNumber || (ONLY_RUN_NUMBERS !== null && ONLY_RUN_NUMBERS.indexOf(run.runNumber) === -1)) {
                continue;
            }
            const name = RUN_PREFIX + "_" + String(run.runNumber).padStart(3, "0");
            const startTime = Date.now();
            const result = await evaluate("rome.runSimulation(" + JSON.stringify(run.ground) + ", " + run.seed + ", " + dayCount + ", " + JSON.stringify(run.parameters) + ", " + JSON.stringify(GROUND_SIZE) + ")");
            await evaluate("new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); })");
            const picture = await send("Page.captureScreenshot", { format: "jpeg", quality: 88 });
            fs.writeFileSync(path.join(runDirectory, name + ".jpg"), Buffer.from(picture.data, "base64"));
            const statistics = result.statistics;
            const label = name + " · seed " + run.seed + " · " + (run.ground === "square" ? "square " + GROUND_SIZE.squarePointCount : "irregular " + GROUND_SIZE.largeIrregularRingCount) + " · " + statistics.households + " households · " +
                statistics.classicalBlocks + " classical blocks";
            fs.writeFileSync(path.join(runDirectory, name + ".json"), JSON.stringify({
                name: name, label: label, ground: run.ground, seed: run.seed, dayCount: dayCount, parameters: result.parameters,
                statistics: statistics, monuments: result.monuments, groundSize: result.groundSize, saved: result.saved,
            }));
            console.log(label + " · " + Math.round((Date.now() - startTime) / 1000) + " s");
        }
    } finally {
        browser.kill();
    }

    // the list for the app and the table of all the runs that are on the disk
    const savedRuns = fs.readdirSync(runDirectory).filter(function (fileName) {
        return /^[a-z]+_\d+\.json$/.test(fileName);
    }).sort().map(function (fileName) {
        return JSON.parse(fs.readFileSync(path.join(runDirectory, fileName), "utf8"));
    });
    fs.writeFileSync(path.join(runDirectory, "index.json"), JSON.stringify(savedRuns.map(function (run) {
        return { file: run.name + ".json", label: run.label };
    }), null, 1));
    if (savedRuns.length > 0) {
        // (runs of different ages know different parameters and numbers: every name any of them has)
        const parameterNames = [];
        const statisticNames = [];
        savedRuns.forEach(function (run) {
            Object.keys(run.parameters).forEach(function (name) { if (parameterNames.indexOf(name) === -1) { parameterNames.push(name); } });
            Object.keys(run.statistics).forEach(function (name) { if (statisticNames.indexOf(name) === -1) { statisticNames.push(name); } });
        });
        const lines = [["run", "ground", "seed"].concat(parameterNames, statisticNames, ["monuments"]).join(",")];
        savedRuns.forEach(function (run) {
            const monuments = Object.keys(run.monuments).map(function (monumentName) { return run.monuments[monumentName] + " " + monumentName; }).join("; ");
            lines.push([run.name, run.ground, run.seed].concat(
                parameterNames.map(function (parameterName) { return run.parameters[parameterName] === undefined ? "" : run.parameters[parameterName]; }),
                statisticNames.map(function (statisticName) {
                    const value = run.statistics[statisticName] === undefined ? "" : String(run.statistics[statisticName]);
                    return /[",]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
                }),
                ['"' + monuments + '"']).join(","));
        });
        fs.writeFileSync(path.join(runDirectory, "runs.csv"), lines.join("\n") + "\n");
    }
    console.log(savedRuns.length + " runs on the disk; index.json and runs.csv written");
    process.exit(0);
}

main().catch(function (error) {
    console.error(error);
    process.exit(1);
});
