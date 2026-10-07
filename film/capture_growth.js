// Films the growth of settlements, frame by frame, for the introduction film, with headless
// Chrome driving a built copy of the app (npx vite build --base ./ --outDir dist):
//   node film/capture_growth.js [shotName ...]
// Every frame is taken once for each of its layers (the town itself, and the data layers over
// it), so that the cut can pass from one to another on the same frame. The numbers of every frame
// (and what the city did) are kept beside the pictures, to draw the charts from:
//   film/footage_raw/<shot>/<layer>/frame_00001.jpg ...
//   film/footage_raw/<shot>/frames.jsonl     one line for each frame: day, numbers, events, camera
// The page: ROME_PAGE_ADDRESS (default: the built copy in dist next to this folder).
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const childProcess = require("child_process");

const PROJECT_FOLDER = path.join(__dirname, "..");
const PAGE_ADDRESS = process.env.ROME_PAGE_ADDRESS || "file://" + path.join(PROJECT_FOLDER, "dist", "index.html");
const DEBUGGING_PORT = Number(process.env.ROME_DEBUGGING_PORT || 9380);
const PICTURE_WIDTH = 1920;
const PICTURE_HEIGHT = 1080;
const FRAMES_PER_SECOND = 30;

const ALL_DATA_LAYERS = ["none", "traffic", "security", "location", "landPrice", "worth", "rent", "owners", "livelihood", "height", "pressure", "works"];

// The shots. growth: a settlement from its first day, so many days for every frame, the camera
// going slowly round it and coming nearer as it grows. orbit: a saved town, once round it.
// street: the people walking a busy street of a grown town, in their own time. gate: a walk at
// eye height through a gate of the city.
const SHOTS = {
  squareGrowth: {
    kind: "growth", ground: "square", seed: 2001, pointsAlongASide: 50, ringCount: 8, parameters: {},
    dayCount: 3600, frameCount: 1200, layers: ALL_DATA_LAYERS,
    camera: { startAngle: 0.55, turn: 0.75, startDistance: 3.2, endDistance: 2.35, elevation: 0.5, fieldOfView: 30 },
  },
  // the same town from a camera that stands still, for laying one data layer over another
  squareGrowthStill: {
    kind: "growth", ground: "square", seed: 2001, pointsAlongASide: 50, ringCount: 8, parameters: {},
    dayCount: 3600, frameCount: 600, layers: ["none", "traffic", "security", "location", "landPrice", "worth", "height", "owners"],
    camera: { startAngle: 0.55, turn: 0, startDistance: 2.5, endDistance: 2.5, elevation: 0.75, fieldOfView: 30 },
  },
  hexGrowth: {
    kind: "growth", ground: "largeIrregular", seed: 2002, pointsAlongASide: 30, ringCount: 14, parameters: {},
    dayCount: 3600, frameCount: 1200, layers: ALL_DATA_LAYERS,
    camera: { startAngle: 2.2, turn: -0.7, startDistance: 3.2, endDistance: 2.35, elevation: 0.52, fieldOfView: 30 },
  },
  hugeOrbit: {
    kind: "orbit", runFile: "huge_001.json", frameCount: 900, layers: ["none", "works", "owners"],
    camera: { startAngle: 0.3, turn: 6.283, startDistance: 2.6, endDistance: 2.6, elevation: 0.42, fieldOfView: 30 },
  },
  hexOrbit: {
    kind: "orbit", runFile: "huge_002.json", frameCount: 900, layers: ["none", "works"],
    camera: { startAngle: 1.3, turn: 6.283, startDistance: 2.6, endDistance: 2.6, elevation: 0.42, fieldOfView: 30 },
  },
  street: {
    kind: "street", ground: "square", seed: 2001, pointsAlongASide: 50, ringCount: 8, parameters: {},
    dayCount: 2600, frameCount: 450,
  },
  gateWalk: {
    kind: "gate", ground: "square", seed: 2001, pointsAlongASide: 50, ringCount: 8, parameters: {},
    dayCount: 2600, frameCount: 360,
  },
};

function wait(milliseconds) {
    return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
}

async function main() {
    const shotNames = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(SHOTS);
    const chromePath = process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "C:/Program Files/Google/Chrome/Application/chrome.exe";
    const browser = childProcess.spawn(chromePath, [
        "--headless=new", "--remote-debugging-port=" + DEBUGGING_PORT, "--window-size=" + PICTURE_WIDTH + "," + PICTURE_HEIGHT,
        "--user-data-dir=" + path.join(os.tmpdir(), "rome-film-chrome-" + DEBUGGING_PORT), "--ignore-gpu-blocklist", "--enable-gpu-rasterization",
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
        const reply = await send("Runtime.evaluate", { expression: expression, returnByValue: true, awaitPromise: true });
        if (reply.exceptionDetails) {
            throw new Error(expression.slice(0, 80) + ": " + (reply.exceptionDetails.exception ? reply.exceptionDetails.exception.description : reply.exceptionDetails.text));
        }
        return reply.result.value;
    }
    async function takePicture(fileName) {
        // two frames of the page's own drawing, so that what is captured is the new state
        await evaluate("new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); })");
        const reply = await send("Page.captureScreenshot", { format: "jpeg", quality: 94 });
        fs.mkdirSync(path.dirname(fileName), { recursive: true });
        fs.writeFileSync(fileName, Buffer.from(reply.data, "base64"));
    }
    // the camera on its circle round the ground: progress from 0 to 1
    function cameraOnItsCircle(bounds, camera, progress) {
        const easedProgress = progress * progress * (3 - 2 * progress);
        const angle = camera.startAngle + camera.turn * (camera.turn > 6 ? progress : easedProgress);
        const distance = bounds.reach * (camera.startDistance + (camera.endDistance - camera.startDistance) * easedProgress);
        const height = distance * Math.sin(camera.elevation);
        const across = distance * Math.cos(camera.elevation);
        return {
            x: bounds.centreX + across * Math.sin(angle), y: height, z: bounds.centreZ + across * Math.cos(angle),
            targetX: bounds.centreX, targetY: 2, targetZ: bounds.centreZ, fieldOfView: camera.fieldOfView,
        };
    }
    async function placeCamera(view) {
        await evaluate("rome.view(" + [view.x, view.y, view.z, view.targetX, view.targetY, view.targetZ, view.fieldOfView].join(",") + ")");
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
        await send("Page.navigate", { url: PAGE_ADDRESS });
        for (let attempt = 0; attempt < 160; attempt++) {
            await wait(250);
            const isReady = await evaluate("Boolean(window.rome)").catch(function () { return false; });
            if (isReady) { break; }
        }
        await wait(1500);

        for (const shotName of shotNames) {
            const shot = Object.assign({}, SHOTS[shotName]);
            // ROME_FRAME_SHARE: a test takes only this share of the frames (the days shortened alike)
            const frameShare = Number(process.env.ROME_FRAME_SHARE || 1);
            shot.frameCount = Math.max(2, Math.round(shot.frameCount * frameShare));
            if (shot.kind === "growth") {
                shot.dayCount = Math.round(shot.dayCount * Math.max(frameShare, 0.3));
            }
            const shotFolder = path.join(__dirname, "footage_raw", shotName);
            fs.rmSync(shotFolder, { recursive: true, force: true });
            fs.mkdirSync(shotFolder, { recursive: true });
            const frameLog = fs.createWriteStream(path.join(shotFolder, "frames.jsonl"));
            const startTime = Date.now();
            console.log(shotName + ": " + shot.kind + ", " + shot.frameCount + " frames");

            if (shot.kind === "growth") {
                const bounds = await evaluate("rome.filmPrepare(" + [JSON.stringify(shot.ground), shot.seed, shot.pointsAlongASide, shot.ringCount, JSON.stringify(shot.parameters)].join(",") + ")");
                await evaluate("rome.filmPeople(0, false)");
                let dayReached = 0;
                for (let frameNumber = 0; frameNumber < shot.frameCount; frameNumber++) {
                    // the days go faster as the town gets going: few at first, more later
                    const progress = (frameNumber + 1) / shot.frameCount;
                    const dayWanted = Math.round(shot.dayCount * Math.pow(progress, 1.35));
                    const result = await evaluate("rome.filmAdvance(" + (dayWanted - dayReached) + ")");
                    dayReached = dayWanted;
                    const view = cameraOnItsCircle(bounds, shot.camera, frameNumber / Math.max(1, shot.frameCount - 1));
                    await placeCamera(view);
                    for (const layerName of shot.layers) {
                        await evaluate("rome.filmLayer(" + JSON.stringify(layerName) + ")");
                        await takePicture(path.join(shotFolder, layerName, "frame_" + String(frameNumber + 1).padStart(5, "0") + ".jpg"));
                    }
                    frameLog.write(JSON.stringify({ frame: frameNumber + 1, day: result.day, treasury: result.treasury, statistics: result.statistics, events: result.events, camera: view }) + "\n");
                    if (frameNumber % 50 === 0) {
                        console.log("  frame " + (frameNumber + 1) + " · day " + result.day + " · " + result.statistics.households + " households · " + Math.round((Date.now() - startTime) / 1000) + " s");
                    }
                }
            } else if (shot.kind === "orbit") {
                const run = JSON.parse(fs.readFileSync(path.join(PROJECT_FOLDER, "tools", "runs", shot.runFile), "utf8"));
                const bounds = await evaluate("rome.filmLoad(" + JSON.stringify(run) + ")");
                await evaluate("rome.filmPeople(0, false)");
                for (let frameNumber = 0; frameNumber < shot.frameCount; frameNumber++) {
                    const view = cameraOnItsCircle(bounds, shot.camera, frameNumber / shot.frameCount);
                    await placeCamera(view);
                    for (const layerName of shot.layers) {
                        await evaluate("rome.filmLayer(" + JSON.stringify(layerName) + ")");
                        await takePicture(path.join(shotFolder, layerName, "frame_" + String(frameNumber + 1).padStart(5, "0") + ".jpg"));
                    }
                    frameLog.write(JSON.stringify({ frame: frameNumber + 1, camera: view }) + "\n");
                    if (frameNumber % 100 === 0) {
                        console.log("  frame " + (frameNumber + 1) + " · " + Math.round((Date.now() - startTime) / 1000) + " s");
                    }
                }
            } else {
                // a grown town; the people set out on the latest journeys and walk in their own time
                await evaluate("rome.filmPrepare(" + [JSON.stringify(shot.ground), shot.seed, shot.pointsAlongASide, shot.ringCount, JSON.stringify(shot.parameters)].join(",") + ")");
                await evaluate("rome.filmAdvance(" + shot.dayCount + ")");
                await evaluate("rome.filmLayer('none')");
                // the people: a day of journeys at a time is queued, and they walk a frame's time on
                await evaluate("rome.filmPeople(0, true)");
                for (let warm = 0; warm < 120; warm++) {
                    if (warm % 20 === 0) {
                        await evaluate("(function () { rome.settleOn(1); return true; })()");
                    }
                    await evaluate("rome.filmPeople(" + (1 / FRAMES_PER_SECOND * 4) + ", true)");
                }
                // the camera follows a way people really walked: along the streets, through a gate
                const walk = await evaluate("rome.filmWalkPath()");
                if (walk === null) {
                    console.log("  no journey to follow; shot skipped");
                    frameLog.end();
                    continue;
                }
                const distances = [0];
                for (let step = 1; step < walk.places.length; step++) {
                    distances.push(distances[step - 1] + Math.hypot(walk.places[step].x - walk.places[step - 1].x, walk.places[step].z - walk.places[step - 1].z));
                }
                const wayLength = distances[distances.length - 1];
                // a place on the way at a distance along it, smoothed: the mean of the places round it
                function placeAlong(distance) {
                    function exactly(along) {
                        const clamped = Math.max(0, Math.min(wayLength, along));
                        let step = 1;
                        while (step < distances.length - 1 && distances[step] < clamped) {
                            step++;
                        }
                        const share = (clamped - distances[step - 1]) / Math.max(0.001, distances[step] - distances[step - 1]);
                        return {
                            x: walk.places[step - 1].x + (walk.places[step].x - walk.places[step - 1].x) * share,
                            z: walk.places[step - 1].z + (walk.places[step].z - walk.places[step - 1].z) * share,
                        };
                    }
                    let sumX = 0;
                    let sumZ = 0;
                    const sampleCount = 7;
                    for (let sample = 0; sample < sampleCount; sample++) {
                        const place = exactly(distance + (sample - (sampleCount - 1) / 2) * 0.5);
                        sumX += place.x;
                        sumZ += place.z;
                    }
                    return { x: sumX / sampleCount, z: sumZ / sampleCount };
                }
                const gateDistance = walk.gateAt >= 0 ? distances[walk.gateAt] : wayLength / 2;
                const firstDistance = Math.max(0, gateDistance - (shot.kind === "gate" ? 28 : 40));
                const lastDistance = Math.min(wayLength, gateDistance + (shot.kind === "gate" ? 14 : 4));
                for (let frameNumber = 0; frameNumber < shot.frameCount; frameNumber++) {
                    const progress = frameNumber / Math.max(1, shot.frameCount - 1);
                    const distance = firstDistance + (lastDistance - firstDistance) * progress;
                    const here = placeAlong(distance);
                    const ahead = placeAlong(distance + 14);
                    let view = null;
                    if (shot.kind === "street") {
                        // over the heads, looking along the street ahead and down at the people
                        view = { x: here.x, y: 26, z: here.z, targetX: ahead.x, targetY: 0, targetZ: ahead.z, fieldOfView: 45 };
                    } else {
                        // at eye height, walking the way out through the gate
                        view = { x: here.x, y: 1.65, z: here.z, targetX: ahead.x, targetY: 2.3, targetZ: ahead.z, fieldOfView: 62 };
                    }
                    await placeCamera(view);
                    if (frameNumber % 30 === 0) {
                        await evaluate("(function () { rome.settleOn(1); return true; })()");
                    }
                    const walking = await evaluate("rome.filmPeople(" + (1 / FRAMES_PER_SECOND) + ", true)");
                    await takePicture(path.join(shotFolder, "none", "frame_" + String(frameNumber + 1).padStart(5, "0") + ".jpg"));
                    frameLog.write(JSON.stringify({ frame: frameNumber + 1, peopleWalking: walking, camera: view }) + "\n");
                }
            }
            frameLog.end();
            console.log(shotName + " done in " + Math.round((Date.now() - startTime) / 60000) + " min");
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
