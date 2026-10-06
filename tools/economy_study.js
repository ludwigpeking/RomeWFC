// A study of the economy: settlements run with the parameters the app starts with (several seeds)
// and with each parameter set lower and higher in turn, their numbers taken through their days,
// with nothing drawn. For seeing whether the town stalls, bounces back, grows, and how varied it is.
//   node tools/economy_study.js [dayCount]
// Settings by the environment: ROME_STUDY_RUNS ("1,5,9": only these runs, so several can share
// the work, each with its own ROME_DEBUGGING_PORT), ROME_PAGE_ADDRESS (default: dist next to tools).
// Each run is written to tools/study/<name>.json.
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const childProcess = require("child_process");

const PROJECT_FOLDER = path.join(__dirname, "..");
const PAGE_ADDRESS = process.env.ROME_PAGE_ADDRESS || "file://" + path.join(PROJECT_FOLDER, "dist", "index.html");
const DEBUGGING_PORT = Number(process.env.ROME_DEBUGGING_PORT || 9400);
const GROUND = { ground: "square", pointsAlongASide: 40, ringCount: 8 };
const DAYS_BETWEEN_SAMPLES = 50;

// each parameter set lower and higher, the others as they are
const VARIATIONS = {
    landPriceScale: [0.00025, 0.001],
    rentRateEachDay: [0.0012, 0.003],
    requiredReturnEachDay: [0.0018, 0.004],
    depreciationEachDay: [0.0001, 0.0012],
    constructionCostGrowthPerLevel: [1.1, 1.5],
    managementLossPerCell: [0.015, 0.15],
    acquisitionPremium: [0.1, 0.6],
    gardenRentBonus: [0.05, 0.3],
    shareOfFarmers: [0.2, 0.8],
    farmYieldEachDay: [0.03, 0.12],
    journeysPerHouseholdEachDay: [0.18, 0.7],
    trafficKeptEachDay: [0.995, 0.9995],
    taxShareOfPropertyEachDay: [0.0001, 0.0008],
};

function studyRuns() {
    const runs = [];
    [11, 12, 13].forEach(function (seed) {
        runs.push({ name: "usual_seed" + seed, seed: seed, parameters: {} });
    });
    Object.keys(VARIATIONS).forEach(function (parameterName) {
        VARIATIONS[parameterName].forEach(function (value, index) {
            runs.push({ name: parameterName + (index === 0 ? "_lower" : "_higher"), seed: 11, parameters: { [parameterName]: value } });
        });
    });
    return runs.map(function (run, index) { return Object.assign({ number: index + 1 }, run); });
}

function wait(milliseconds) {
    return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
}

async function main() {
    const dayCount = Number(process.argv[2] || 6000);
    const onlyRunNumbers = process.env.ROME_STUDY_RUNS ? process.env.ROME_STUDY_RUNS.split(",").map(Number) : null;
    const outputFolder = path.join(__dirname, "study");
    fs.mkdirSync(outputFolder, { recursive: true });
    const chromePath = process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "C:/Program Files/Google/Chrome/Application/chrome.exe";
    const browser = childProcess.spawn(chromePath, [
        "--headless=new", "--remote-debugging-port=" + DEBUGGING_PORT, "--window-size=800,600",
        "--user-data-dir=" + path.join(os.tmpdir(), "rome-study-chrome-" + DEBUGGING_PORT), "--allow-file-access-from-files", "--no-first-run", "about:blank"], { stdio: "ignore" });
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
        await send("Runtime.enable");
        await send("Page.enable");
        await send("Page.navigate", { url: PAGE_ADDRESS });
        for (let attempt = 0; attempt < 160; attempt++) {
            await wait(250);
            const isReady = await evaluate("Boolean(window.rome)").catch(function () { return false; });
            if (isReady) { break; }
        }
        await wait(1000);
        for (const run of studyRuns()) {
            if (onlyRunNumbers !== null && onlyRunNumbers.indexOf(run.number) === -1) {
                continue;
            }
            const startTime = Date.now();
            const result = await evaluate("rome.studyEconomy(" + [JSON.stringify(GROUND.ground), run.seed, GROUND.pointsAlongASide, GROUND.ringCount,
                JSON.stringify(run.parameters), dayCount, DAYS_BETWEEN_SAMPLES].join(",") + ")");
            fs.writeFileSync(path.join(outputFolder, run.name + ".json"), JSON.stringify(Object.assign({ name: run.name, seed: run.seed, changed: run.parameters, ground: GROUND }, result)));
            const last = result.samples[result.samples.length - 1];
            console.log(run.number + " " + run.name + " · " + last.households + " households · " + last.houseBlocks + " houses · " + last.classicalBlocks + " classical · " +
                Math.round((Date.now() - startTime) / 1000) + " s");
        }
    } finally {
        browser.kill();
    }
    process.exit(0);
}

main().catch(function (error) {
    console.error(error);
    process.exit(1);
});
