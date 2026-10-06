// Records a settlement growing, frame by frame, with headless Chrome driving the running app
// (npm run dev):
//   node tools/record_settlement.js [ground] [frameCount] [daysPerFrame] [seed]
// ground is 'largeIrregular' (the default) or 'square'. The frames go to tools/film/frames as
// frame_00001.jpg and so on; join them with
//   ffmpeg -framerate 30 -i tools/film/frames/frame_%05d.jpg -c:v libx264 -crf 18 -pix_fmt yuv420p tools/film/settlement.mp4
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const childProcess = require("child_process");

// the running app; or, with no server running, a built copy of it (npx vite build --base ./) opened
// as a file: set ROME_PAGE_ADDRESS to the address of its index.html
const PAGE_ADDRESS = process.env.ROME_PAGE_ADDRESS || "http://localhost:5210/";
const DEBUGGING_PORT = 9343;
const PICTURE_WIDTH = 1920;
const PICTURE_HEIGHT = 1080;

function wait(milliseconds) {
    return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
}

async function main() {
    const ground = process.argv[2] || "largeIrregular";
    const frameCount = Number(process.argv[3] || 360);
    const daysPerFrame = Number(process.argv[4] || 6);
    const seed = Number(process.argv[5] || 3);
    const frameDirectory = path.join(__dirname, "film", "frames");
    fs.rmSync(frameDirectory, { recursive: true, force: true });
    fs.mkdirSync(frameDirectory, { recursive: true });

    const chromePath = process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "C:/Program Files/Google/Chrome/Application/chrome.exe";
    const browser = childProcess.spawn(chromePath, [
        "--headless=new", "--remote-debugging-port=" + DEBUGGING_PORT, "--window-size=" + PICTURE_WIDTH + "," + PICTURE_HEIGHT,
        "--user-data-dir=" + path.join(os.tmpdir(), "rome-wfc-film-chrome"), "--ignore-gpu-blocklist", "--allow-file-access-from-files", "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
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
        await wait(800);
        const pointCount = await evaluate("rome.filmStart(" + JSON.stringify(ground) + ", " + seed + ")");
        console.log("ground " + ground + ": " + pointCount + " points; " + frameCount + " frames of " + daysPerFrame + " days");
        for (let frameNumber = 0; frameNumber < frameCount; frameNumber++) {
            const summary = await evaluate("rome.filmFrame(" + daysPerFrame + ", " + frameNumber + ", " + frameCount + ")");
            // two frames of the page's own drawing, so that what is captured is the new state
            await evaluate("new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); })");
            const reply = await send("Page.captureScreenshot", { format: "jpeg", quality: 93 });
            fs.writeFileSync(path.join(frameDirectory, "frame_" + String(frameNumber + 1).padStart(5, "0") + ".jpg"), Buffer.from(reply.data, "base64"));
            if (frameNumber % 20 === 0 || frameNumber === frameCount - 1) {
                console.log("frame " + (frameNumber + 1) + ": " + summary);
            }
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
