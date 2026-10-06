// Takes pictures of the running app (npm run dev) with headless Chrome:
//   node tools/screenshot.js name "script to run in the page" [name "script" ...]
// Each script runs in the page (window.rome is there to drive it); the picture goes to
// tools/pictures/<name>.jpg. Page errors are printed.
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const childProcess = require("child_process");

// the running app; or, with no server running, a built copy of it (npx vite build --base ./) opened
// as a file: set ROME_PAGE_ADDRESS to the address of its index.html
const PAGE_ADDRESS = process.env.ROME_PAGE_ADDRESS || "http://localhost:5210/";
const DEBUGGING_PORT = 9342;
const PICTURE_WIDTH = 1920;
const PICTURE_HEIGHT = 1080;

function wait(milliseconds) {
    return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
}

async function main() {
    const requests = process.argv.slice(2);
    const chromePath = process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "C:/Program Files/Google/Chrome/Application/chrome.exe";
    const browser = childProcess.spawn(chromePath, [
        "--headless=new", "--remote-debugging-port=" + DEBUGGING_PORT, "--window-size=" + PICTURE_WIDTH + "," + PICTURE_HEIGHT,
        "--user-data-dir=" + path.join(os.tmpdir(), "rome-wfc-chrome"), "--ignore-gpu-blocklist", "--allow-file-access-from-files", "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
    let socket = null;
    let nextMessageId = 1;
    const pendingReplies = new Map();
    const pageErrors = [];
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
            } else if (message.method === "Runtime.exceptionThrown") {
                pageErrors.push(message.params.exceptionDetails.exception ? message.params.exceptionDetails.exception.description : message.params.exceptionDetails.text);
            } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
                pageErrors.push(message.params.args.map(function (argument) { return argument.value || argument.description; }).join(" "));
            }
        };
        await send("Page.enable");
        await send("Runtime.enable");
        await send("Emulation.setDeviceMetricsOverride", { width: PICTURE_WIDTH, height: PICTURE_HEIGHT, deviceScaleFactor: 1, mobile: false });
        await send("Page.navigate", { url: PAGE_ADDRESS });
        for (let attempt = 0; attempt < 80; attempt++) {
            await wait(250);
            const isReady = await evaluate("Boolean(window.rome)").catch(function () { return false; });
            if (isReady) { break; }
        }
        await wait(800);
        const pictureDirectory = path.join(__dirname, "pictures");
        fs.mkdirSync(pictureDirectory, { recursive: true });
        for (let index = 0; index + 1 < requests.length; index += 2) {
            const result = await evaluate(requests[index + 1]);
            await wait(700);
            const reply = await send("Page.captureScreenshot", { format: "jpeg", quality: 90 });
            fs.writeFileSync(path.join(pictureDirectory, requests[index] + ".jpg"), Buffer.from(reply.data, "base64"));
            console.log(requests[index] + ": " + JSON.stringify(result));
        }
        if (pageErrors.length > 0) { console.log("page errors:\n" + pageErrors.slice(0, 6).join("\n")); }
    } finally {
        browser.kill();
    }
    process.exit(0);
}

main().catch(function (error) {
    console.error(error);
    process.exit(1);
});
