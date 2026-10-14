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
  // the town on the square ground, from empty ground on
  squareGrowth: {
    kind: "growth", ground: "square", seed: 2001, pointsAlongASide: 80, ringCount: 18, parameters: {},
    dayCount: 4500, frameCount: 1500, layers: ["none", "journeys", "security", "location", "landPrice", "height", "owners"],
    camera: { startAngle: 0.55, turn: 0.9, startDistance: 2.5, endDistance: 1.8, elevation: 0.5, fieldOfView: 30 },
  },
  // ... and on the irregular ground
  hexGrowth: {
    kind: "growth", ground: "largeIrregular", seed: 2002, pointsAlongASide: 80, ringCount: 18, parameters: {},
    dayCount: 4500, frameCount: 700, layers: ["none", "location", "height"],
    camera: { startAngle: 2.2, turn: -0.9, startDistance: 2.5, endDistance: 1.8, elevation: 0.5, fieldOfView: 30 },
  },
  // the growth on the irregular ground of 18 rings, the camera going slowly once round the town
  // (the author, 2026-10-13: a recording of a growth simulation), 60 seconds at 30 frames
  irregularGrowth18: {
    kind: "growth", ground: "irregular", seed: 3003, pointsAlongASide: 80, ringCount: 18, parameters: {},
    dayCount: 4500, frameCount: 1800, layers: ["none"],
    camera: { startAngle: 0.4, turn: 2 * Math.PI, startDistance: 2.4, endDistance: 1.7, elevation: 0.48, fieldOfView: 30 },
  },
  // two larger grounds, more days, a slower turn (the author, 2026-10-13): 100 seconds each, the
  // camera ending far enough out to hold the whole town (at 1.7 the town of 18 rings ran out of the frame)
  hexGrowth24: {
    kind: "growth", ground: "irregular", seed: 3004, pointsAlongASide: 90, ringCount: 24, parameters: {},
    dayCount: 6000, frameCount: 3000, layers: ["none"],
    camera: { startAngle: 0.4, turn: 2 * Math.PI, startDistance: 2.6, endDistance: 2.2, elevation: 0.48, fieldOfView: 30 },
  },
  squareGrowth90: {
    kind: "growth", ground: "square", seed: 3005, pointsAlongASide: 90, ringCount: 24, parameters: {},
    dayCount: 6000, frameCount: 3000, layers: ["none"],
    camera: { startAngle: 2.6, turn: -2 * Math.PI, startDistance: 2.6, endDistance: 2.2, elevation: 0.48, fieldOfView: 30 },
  },
  // the grown towns from near and low, the people walking
  squareBeauty: {
    kind: "grownOrbit", ground: "square", seed: 2001, pointsAlongASide: 80, ringCount: 18, parameters: {},
    dayCount: 4500, frameCount: 750, layers: ["none"],
    camera: { startAngle: 0.2, turn: 1.1, startDistance: 1.25, endDistance: 0.95, elevation: 0.26, fieldOfView: 34 },
  },
  hexBeauty: {
    kind: "grownOrbit", ground: "largeIrregular", seed: 2002, pointsAlongASide: 80, ringCount: 18, parameters: {},
    dayCount: 4500, frameCount: 600, layers: ["none"],
    camera: { startAngle: 1.0, turn: -1.1, startDistance: 1.25, endDistance: 0.95, elevation: 0.26, fieldOfView: 34 },
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
        async function openThePage() {
            await send("Page.navigate", { url: PAGE_ADDRESS });
            for (let attempt = 0; attempt < 160; attempt++) {
                await wait(250);
                const isReady = await evaluate("Boolean(window.rome)").catch(function () { return false; });
                if (isReady) { break; }
            }
            await wait(1500);
        }
        await openThePage();
        // A long growth: the page's memory piles up over the rebuilds (a dense town brought the
        // Mac's Chrome down at about the 28th rebuild of the experiments), so every so many
        // frames the run is saved, the page opened anew and the run loaded back: the settlement
        // goes on exactly as it would have (its random state is saved with it).
        // (100 frames for the large grounds: the page of a town of 24 rings reached 7 GB in 200
        // frames and the Mac crawled). At every reload the run is also written to disk,
        // <shot>/checkpoint.json, and ROME_RESUME=1 takes a shot up again from its checkpoint.
        const framesBetweenReloads = Number(process.env.ROME_FRAMES_BETWEEN_RELOADS || 100);
        const resumes = process.env.ROME_RESUME === "1";

        for (const shotName of shotNames) {
            const shot = Object.assign({}, SHOTS[shotName]);
            // ROME_FRAME_SHARE: a test takes only this share of the frames (the days shortened alike)
            const frameShare = Number(process.env.ROME_FRAME_SHARE || 1);
            shot.frameCount = Math.max(2, Math.round(shot.frameCount * frameShare));
            if (shot.kind === "growth") {
                shot.dayCount = Math.round(shot.dayCount * Math.max(frameShare, 0.3));
            }
            const shotFolder = path.join(__dirname, "footage_raw", shotName);
            const checkpointFile = path.join(shotFolder, "checkpoint.json");
            let checkpoint = null;
            if (resumes && shot.kind === "growth" && fs.existsSync(checkpointFile)) {
                checkpoint = JSON.parse(fs.readFileSync(checkpointFile, "utf8"));
                console.log(shotName + ": taken up again from frame " + checkpoint.frameNumber + ", day " + checkpoint.dayReached);
            } else {
                fs.rmSync(shotFolder, { recursive: true, force: true });
                fs.mkdirSync(shotFolder, { recursive: true });
            }
            const frameLog = fs.createWriteStream(path.join(shotFolder, "frames.jsonl"), { flags: checkpoint ? "a" : "w" });
            const startTime = Date.now();
            console.log(shotName + ": " + shot.kind + ", " + shot.frameCount + " frames");

            if (shot.kind === "growth") {
                let bounds;
                let dayReached = 0;
                let firstFrame = 0;
                if (checkpoint) {
                    bounds = await evaluate("rome.filmLoad(" + JSON.stringify(checkpoint.run) + ")");
                    dayReached = checkpoint.dayReached;
                    firstFrame = checkpoint.frameNumber;
                } else {
                    bounds = await evaluate("rome.filmPrepare(" + [JSON.stringify(shot.ground), shot.seed, shot.pointsAlongASide, shot.ringCount, JSON.stringify(shot.parameters)].join(",") + ")");
                }
                await evaluate("rome.filmFaintOpacity(0.05)");
                await evaluate("rome.filmPeople(0, false)");
                for (let frameNumber = firstFrame; frameNumber < shot.frameCount; frameNumber++) {
                    // the days go faster as the town gets going: few at first, more later
                    const progress = (frameNumber + 1) / shot.frameCount;
                    const dayWanted = Math.round(shot.dayCount * Math.pow(progress, 1.35));
                    if (frameNumber > firstFrame && frameNumber % framesBetweenReloads === 0) {
                        const run = await evaluate("rome.saveRun()");
                        fs.writeFileSync(checkpointFile, JSON.stringify({ frameNumber: frameNumber, dayReached: dayReached, run: run }));
                        await openThePage();
                        await evaluate("rome.filmLoad(" + JSON.stringify(run) + ")");
                        await evaluate("rome.filmFaintOpacity(0.05)");
                        await evaluate("rome.filmPeople(0, false)");
                        console.log("  frame " + frameNumber + ": the page opened anew, the run loaded back");
                    }
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
            } else if (shot.kind === "grownOrbit") {
                // a town lived to its day with nothing drawn, then filmed from near, the people walking
                const bounds = await evaluate("rome.filmPrepare(" + [JSON.stringify(shot.ground), shot.seed, shot.pointsAlongASide, shot.ringCount, JSON.stringify(shot.parameters)].join(",") + ")");
                await evaluate("rome.filmFaintOpacity(0.05)");
                for (let dayReached = 0; dayReached < shot.dayCount; dayReached += 250) {
                    await evaluate("(function () { rome.settleOn(" + Math.min(250, shot.dayCount - dayReached) + "); return true; })()");
                }
                await evaluate("rome.rebuild()");
                await evaluate("rome.filmLayer('none')");
                for (let warm = 0; warm < 150; warm++) {
                    if (warm % 20 === 0) {
                        await evaluate("(function () { rome.settleOn(1); return true; })()");
                    }
                    await evaluate("rome.filmPeople(" + (4 / FRAMES_PER_SECOND) + ", true)");
                }
                for (let frameNumber = 0; frameNumber < shot.frameCount; frameNumber++) {
                    const view = cameraOnItsCircle(bounds, shot.camera, frameNumber / Math.max(1, shot.frameCount - 1));
                    view.targetY = 6;
                    await placeCamera(view);
                    if (frameNumber % 20 === 0) {
                        await evaluate("(function () { rome.settleOn(1); return true; })()");
                    }
                    await evaluate("rome.filmPeople(" + (1 / FRAMES_PER_SECOND) + ", true)");
                    await takePicture(path.join(shotFolder, "none", "frame_" + String(frameNumber + 1).padStart(5, "0") + ".jpg"));
                    frameLog.write(JSON.stringify({ frame: frameNumber + 1, camera: view }) + "\n");
                    if (frameNumber % 100 === 0) {
                        console.log("  frame " + (frameNumber + 1) + " · " + Math.round((Date.now() - startTime) / 1000) + " s");
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
