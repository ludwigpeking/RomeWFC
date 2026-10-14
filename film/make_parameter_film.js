// Composes the film about the parameters of the settlement: for each experiment of
// tools/experiments.js, the town run with the parameter turned down and turned up, side by side
// and growing in step (the snapshots of tools/test_runs.js in tools/tests/<run>/), cut to the
// narration (parameter_narration.json, parameter_voice/), with a trend chart of the runs drawn
// below from their numbers, and the subtitles.
//   node make_parameter_film.js [--output name.mp4] [--preview seconds,seconds,...]
// --preview writes single frames (preview/parameter_frame_<seconds>.jpg) instead of the film.
"use strict";

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const { EXPERIMENTS } = require("../tools/experiments");

const WIDTH = 1920;
const HEIGHT = 1080;
const FRAMES_PER_SECOND = 30;
const FILM_FOLDER = __dirname;
const TESTS_FOLDER = path.join(FILM_FOLDER, "..", "tools", "tests");
const NARRATION_FILE = path.join(FILM_FOLDER, "parameter_narration.json");
const VOICE_FOLDER = path.join(FILM_FOLDER, "parameter_voice");
const PAUSE_BETWEEN_LINES = 0.55;
const PAUSE_BETWEEN_SCENES = 2.4;
const SECONDS_AFTER_THE_LAST_LINE = 6; // a scene's towns go on growing a while after its last line
const ENDING_SECONDS = 14;
const TITLE_SECONDS = 4.0;
const CREDIT_SECONDS = 4.5;
const BASELINE = "exp_baseline";

// the film's own names (the title is provisional until the author gives one)
const FILM_TITLE = ["算法生成城市", "参数的方向"];
const FILM_SUBTITLE = "Which way each parameter pushes the town";
const FILM_BYLINE = "Richard Qian Li 陈腐粉碎机";

GlobalFonts.registerFromPath(path.join(FILM_FOLDER, "fonts", "msyh.ttc"), "Film");
GlobalFonts.registerFromPath(path.join(FILM_FOLDER, "fonts", "msyhbd.ttc"), "FilmBold");

const INK = "#f7f3ea";
const SOFT_INK = "rgba(247, 243, 234, 0.72)";
const ACCENT = "#f0b35a";
const LOW_COLOUR = "#8fc1d4";
const HIGH_COLOUR = "#e2725b";
const BASELINE_COLOUR = "rgba(247, 243, 234, 0.55)";

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function ramp(time, startTime, durationSeconds) { return clamp01((time - startTime) / durationSeconds); }
function ease(value) { const x = clamp01(value); return x * x * (3 - 2 * x); }

// ---------------------------------------------------------------------------
// The narration: when each line is spoken. Scene s00 is the opening, s01... the experiments in
// the order of tools/experiments.js, and the last scene the ending.
// ---------------------------------------------------------------------------
const narration = JSON.parse(fs.readFileSync(NARRATION_FILE, "utf8"));
const scenes = []; // { name, title, start, end, lines: [{ start, end, text, name }] }
(function layOutTheNarration() {
    let time = TITLE_SECONDS;
    narration.forEach(function (line) {
        const sceneName = line.name.split("_")[0];
        let scene = scenes[scenes.length - 1];
        if (!scene || scene.name !== sceneName) {
            if (scene) {
                time += SECONDS_AFTER_THE_LAST_LINE;
                scene.end = time + PAUSE_BETWEEN_SCENES / 2;
                time += PAUSE_BETWEEN_SCENES;
            }
            scene = { name: sceneName, title: line.scene, start: time - (scenes.length === 0 ? 0 : PAUSE_BETWEEN_SCENES / 2), lines: [] };
            scenes.push(scene);
        }
        scene.lines.push({ name: line.name, text: line.zh, start: time, end: time + line.duration });
        time += line.duration + PAUSE_BETWEEN_LINES;
    });
    scenes[scenes.length - 1].end = time + ENDING_SECONDS;
}());
const FILM_SECONDS = scenes[scenes.length - 1].end + CREDIT_SECONDS;

function sceneAt(time) {
    return scenes.find(function (scene) { return time >= scene.start && time < scene.end; }) || null;
}
function lineStart(scene, lineNumber) {
    return lineNumber <= scene.lines.length ? scene.lines[lineNumber - 1].start : scene.end;
}
// the experiment a scene shows: s01 the first of tools/experiments.js, and so on
function experimentOfScene(scene) {
    const number = Number(scene.name.slice(1));
    return number >= 1 && number <= EXPERIMENTS.length ? EXPERIMENTS[number - 1] : null;
}

// ---------------------------------------------------------------------------
// The snapshots of a run and their numbers
// ---------------------------------------------------------------------------
const snapshotsOfRun = new Map();
function snapshots(runName) {
    if (!snapshotsOfRun.has(runName)) {
        const filePath = path.join(TESTS_FOLDER, runName, "numbers.jsonl");
        const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).map(function (text) { return JSON.parse(text); }) : [];
        snapshotsOfRun.set(runName, lines);
    }
    return snapshotsOfRun.get(runName);
}
const imageCache = new Map();
async function snapshotImage(runName, layerName, snapshot) {
    const filePath = path.join(TESTS_FOLDER, runName, layerName, "day_" + String(snapshot.day).padStart(5, "0") + ".jpg");
    if (!imageCache.has(filePath)) {
        if (imageCache.size > 60) {
            imageCache.delete(imageCache.keys().next().value);
        }
        imageCache.set(filePath, fs.existsSync(filePath) ? await loadImage(filePath) : null);
    }
    return imageCache.get(filePath);
}
// the town of a run at a progress through the days of the film's longest run: the snapshot
// before that day, the one after, and how far between them (the two are blended, so that the
// growth runs on smoothly); a run that stopped short holds its last snapshot
const LAST_DAY = 3000;
function snapshotsAround(runName, progress) {
    const list = snapshots(runName);
    if (list.length === 0) {
        return null;
    }
    const day = clamp01(progress) * LAST_DAY;
    let before = 0;
    while (before + 1 < list.length && list[before + 1].day <= day) {
        before++;
    }
    const after = Math.min(list.length - 1, before + 1);
    const span = list[after].day - list[before].day;
    const between = span > 0 ? clamp01((day - list[before].day) / span) : 0;
    return { before: list[before], after: list[after], between: between };
}
async function drawTown(context, runName, layerName, progress, alpha, box) {
    const around = snapshotsAround(runName, progress);
    if (around === null || alpha <= 0) {
        return;
    }
    drawImageCover(context, await snapshotImage(runName, layerName, around.before), alpha, box);
    if (around.between > 0.02 && around.after !== around.before) {
        drawImageCover(context, await snapshotImage(runName, layerName, around.after), alpha * ease(around.between), box);
    }
}
function dayAt(runName, progress) {
    const around = snapshotsAround(runName, progress);
    return around === null ? 0 : Math.round(around.before.day + (around.after.day - around.before.day) * around.between);
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function drawImageCover(context, image, alpha, box) {
    if (!image || alpha <= 0) {
        return;
    }
    const target = box || { x: 0, y: 0, width: WIDTH, height: HEIGHT };
    const scale = Math.max(target.width / image.width, target.height / image.height);
    const sourceWidth = target.width / scale;
    const sourceHeight = target.height / scale;
    context.save();
    context.globalAlpha = alpha;
    context.drawImage(image, (image.width - sourceWidth) / 2, (image.height - sourceHeight) / 2, sourceWidth, sourceHeight, target.x, target.y, target.width, target.height);
    context.restore();
}
function text(context, content, x, y, size, colour, options) {
    const settings = options || {};
    context.save();
    context.font = size + "px " + (settings.bold ? "FilmBold" : "Film");
    context.fillStyle = colour;
    context.globalAlpha = settings.alpha === undefined ? 1 : settings.alpha;
    context.textAlign = settings.align || "left";
    context.textBaseline = settings.baseline || "alphabetic";
    if (settings.shadow !== false) {
        context.shadowColor = "rgba(0, 0, 0, 0.55)";
        context.shadowBlur = 12;
    }
    context.fillText(content, x, y);
    context.restore();
}
function veilLeft(context, strength) {
    const gradient = context.createLinearGradient(0, 0, WIDTH * 0.62, 0);
    gradient.addColorStop(0, "rgba(18, 17, 16, " + (0.86 * strength) + ")");
    gradient.addColorStop(0.55, "rgba(18, 17, 16, " + (0.55 * strength) + ")");
    gradient.addColorStop(1, "rgba(18, 17, 16, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, WIDTH, HEIGHT);
}
function veilFoot(context, strength) {
    const gradient = context.createLinearGradient(0, HEIGHT * 0.72, 0, HEIGHT);
    gradient.addColorStop(0, "rgba(18, 17, 16, 0)");
    gradient.addColorStop(1, "rgba(18, 17, 16, " + (0.82 * strength) + ")");
    context.fillStyle = gradient;
    context.fillRect(0, HEIGHT * 0.72, WIDTH, HEIGHT * 0.28);
}
function chapterTitle(context, scene, time) {
    const alpha = ease(ramp(time, scene.start + 0.2, 0.6)) * (1 - ease(ramp(time, scene.start + 4.2, 0.8)));
    if (alpha > 0) {
        text(context, scene.title, 96, 120, 46, INK, { bold: true, alpha: alpha });
    }
}
function dayCounter(context, day, households, x, y, align) {
    const words = "第 " + day.toLocaleString("en-US") + " 天" + (households === undefined ? "" : " · " + households.toLocaleString("en-US") + " 户");
    text(context, words, x, y, 30, INK, { align: align || "right", bold: true });
}
function subtitle(context, time) {
    const scene = sceneAt(time);
    if (!scene) {
        return;
    }
    const line = scene.lines.find(function (candidate) { return time >= candidate.start - 0.05 && time < candidate.end + 0.2; });
    if (!line) {
        return;
    }
    let rows = [line.text];
    if (line.text.length > 34) {
        let breakAt = -1;
        for (let index = Math.floor(line.text.length * 0.38); index < Math.floor(line.text.length * 0.7); index++) {
            if ("，。；：、".indexOf(line.text[index]) >= 0) { breakAt = index + 1; break; }
        }
        if (breakAt === -1) { breakAt = Math.ceil(line.text.length / 2); }
        rows = [line.text.slice(0, breakAt), line.text.slice(breakAt)];
    }
    rows.forEach(function (row, rowIndex) {
        text(context, row, WIDTH / 2, HEIGHT - 86 + rowIndex * 44 - (rows.length - 1) * 44, 34, INK, { align: "center" });
    });
}

// A trend of the runs over their days, drawn up to a day: no scale, only which way it goes
function trendChart(context, box, runs, valueOf, title, day, alpha) {
    if (alpha <= 0) {
        return;
    }
    // the band of the chart runs from the lowest value any run reaches to the highest, so that
    // runs that differ by a little still draw apart (the chart shows a direction, not a scale)
    let highest = -Infinity;
    let lowest = Infinity;
    let lastDay = 1;
    runs.forEach(function (run) {
        snapshots(run.name).forEach(function (snapshot) {
            highest = Math.max(highest, valueOf(snapshot));
            lowest = Math.min(lowest, valueOf(snapshot));
            lastDay = Math.max(lastDay, snapshot.day);
        });
    });
    if (!(highest > lowest)) {
        lowest = 0;
        highest = Math.max(1, highest);
    }
    context.save();
    context.globalAlpha = alpha;
    text(context, title, box.x, box.y - 14, 26, INK, { bold: true, shadow: false });
    context.strokeStyle = "rgba(247, 243, 234, 0.28)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(box.x, box.y + box.height);
    context.lineTo(box.x + box.width, box.y + box.height);
    context.stroke();
    const labels = [];
    runs.forEach(function (run) {
        const list = snapshots(run.name).filter(function (snapshot) { return snapshot.day <= day; });
        if (list.length === 0) {
            return;
        }
        context.strokeStyle = run.colour;
        context.lineWidth = run.name === BASELINE ? 2.5 : 4;
        context.lineJoin = "round";
        context.beginPath();
        let lastX = box.x;
        let lastY = box.y + box.height;
        list.forEach(function (snapshot, index) {
            lastX = box.x + box.width * snapshot.day / lastDay;
            lastY = box.y + box.height * (1 - (valueOf(snapshot) - lowest) / (highest - lowest));
            if (index === 0) { context.moveTo(lastX, lastY); } else { context.lineTo(lastX, lastY); }
        });
        context.stroke();
        labels.push({ words: run.label, x: lastX + 12, y: lastY + 8, colour: run.colour });
    });
    // the labels at the ends of the lines, pushed apart where lines end close together
    labels.sort(function (first, second) { return first.y - second.y; });
    for (let index = 1; index < labels.length; index++) {
        labels[index].y = Math.max(labels[index].y, labels[index - 1].y + 26);
    }
    // ... and kept within the band of the chart, above the subtitles
    const lowestLabelY = box.y + box.height + 24;
    for (let index = labels.length - 1; index >= 0; index--) {
        const limit = lowestLabelY - (labels.length - 1 - index) * 26;
        labels[index].y = Math.min(labels[index].y, limit);
    }
    labels.forEach(function (label) {
        text(context, label.words, label.x, label.y, 22, label.colour, { shadow: false });
    });
    context.restore();
}

// ---------------------------------------------------------------------------
// The scenes
// ---------------------------------------------------------------------------
// the growth of a scene: its towns go from their first day to their last over the scene
function growth(scene, time) {
    return clamp01((time - scene.start) / (scene.end - scene.start - 1.0));
}
// what each experiment's chart shows (the statistic that moves most with the parameter)
const CHART_OF_EXPERIMENT = {
    fortune: { title: "塔楼与古典楼层", valueOf: function (snapshot) { return snapshot.statistics.classicalBlocks + 3 * snapshot.statistics.towerBlocks; } },
    rent: { title: "楼的平均层数", valueOf: function (snapshot) { return snapshot.statistics.meanLevelsOfABlock; } },
    tax: { title: "市政的库房", valueOf: function (snapshot) { return Math.max(0, snapshot.treasury); } },
    rent: { title: "楼的平均层数", valueOf: function (snapshot) { return snapshot.statistics.meanLevelsOfABlock; } },
    works: { title: "公共建筑的数目", valueOf: function (snapshot) { return String(snapshot.statistics.publicBuildings || "").split(/\s+/).filter(Boolean).length; } },
    garden: { title: "花园的格数", valueOf: function (snapshot) { return snapshot.statistics.gardenPoints; } },
    land: { title: "古典的楼层", valueOf: function (snapshot) { return snapshot.statistics.classicalBlocks; } },
    arrivals: { title: "住户的数量", valueOf: function (snapshot) { return snapshot.statistics.households; } },
    towers: { title: "全古典的楼与塔楼", valueOf: function (snapshot) { return snapshot.statistics.classicalBlocks + snapshot.statistics.towerBlocks; } },
};

async function drawOpening(context, scene, time) {
    const progress = growth(scene, time);
    await drawTown(context, BASELINE, "none", progress, 1);
    veilFoot(context, 0.5);
    dayCounter(context, dayAt(BASELINE, progress), (snapshotsAround(BASELINE, progress) || { before: { statistics: {} } }).before.statistics.households, WIDTH - 96, HEIGHT - 190);
    chapterTitle(context, scene, time);
}

async function drawExperiment(context, scene, time, experiment) {
    const progress = growth(scene, time);
    const lowRun = "exp_" + experiment.name + "_low";
    const highRun = "exp_" + experiment.name + "_high";
    const panelWidth = 944;
    const panelHeight = 531;
    const panelTop = 150;
    const leftBox = { x: 8, y: panelTop, width: panelWidth, height: panelHeight };
    const rightBox = { x: WIDTH - 8 - panelWidth, y: panelTop, width: panelWidth, height: panelHeight };
    await drawTown(context, lowRun, "none", progress, 1, leftBox);
    await drawTown(context, highRun, "none", progress, 1, rightBox);
    // the labels of the two sides, and the day
    text(context, experiment.low.label, leftBox.x + 24, panelTop - 24, 40, LOW_COLOUR, { bold: true });
    text(context, experiment.high.label, rightBox.x + rightBox.width - 24, panelTop - 24, 40, HIGH_COLOUR, { bold: true, align: "right" });
    dayCounter(context, dayAt(BASELINE, progress), undefined, WIDTH / 2, panelTop - 24, "center");
    // the trend below, from the second line on
    const chart = CHART_OF_EXPERIMENT[experiment.name];
    const chartAlpha = ease(ramp(time, lineStart(scene, 2) - 0.5, 1.0));
    trendChart(context, { x: 120, y: panelTop + panelHeight + 56, width: WIDTH - 420, height: 118 }, [
        { name: BASELINE, label: "基准", colour: BASELINE_COLOUR },
        { name: lowRun, label: experiment.low.label, colour: LOW_COLOUR },
        { name: highRun, label: experiment.high.label, colour: HIGH_COLOUR },
    ], chart.valueOf, chart.title, dayAt(BASELINE, progress), chartAlpha);
    chapterTitle(context, scene, time);
}

async function drawEnding(context, scene, time) {
    const progress = clamp01(0.55 + 0.45 * (time - scene.start) / (scene.end - scene.start - 1.0));
    await drawTown(context, BASELINE, "none", progress, 1);
    veilFoot(context, 0.5);
    dayCounter(context, dayAt(BASELINE, progress), (snapshotsAround(BASELINE, progress) || { before: { statistics: {} } }).before.statistics.households, WIDTH - 96, HEIGHT - 190);
    chapterTitle(context, scene, time);
}

async function drawFrame(context, time) {
    context.fillStyle = "#121110";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    if (time < TITLE_SECONDS + 0.8) {
        await drawTown(context, BASELINE, "none", 1, 1);
        veilLeft(context, 1);
        const fade = 1 - ease(ramp(time, TITLE_SECONDS, 0.8));
        text(context, FILM_TITLE[0], 120, 430, 96, INK, { bold: true, alpha: fade });
        text(context, FILM_TITLE[1], 120, 560, 96, ACCENT, { bold: true, alpha: fade });
        text(context, FILM_SUBTITLE, 124, 640, 30, SOFT_INK, { alpha: fade });
        text(context, FILM_BYLINE, 124, 760, 32, INK, { alpha: fade });
        if (time < TITLE_SECONDS) {
            return;
        }
    }
    const scene = sceneAt(time);
    if (scene) {
        context.save();
        context.globalAlpha = time < TITLE_SECONDS + 0.8 ? ease(ramp(time, TITLE_SECONDS, 0.8)) : 1;
        const experiment = experimentOfScene(scene);
        if (scene.name === "s00") {
            await drawOpening(context, scene, time);
        } else if (experiment !== null) {
            await drawExperiment(context, scene, time, experiment);
        } else {
            await drawEnding(context, scene, time);
        }
        veilFoot(context, 0.6);
        subtitle(context, time);
        context.restore();
        return;
    }
    await drawTown(context, BASELINE, "none", 1, 1);
    veilLeft(context, 1);
    text(context, FILM_BYLINE, 120, 520, 54, INK, { bold: true });
    text(context, "画面和曲线都来自片中的模拟", 124, 600, 28, SOFT_INK);
}

function subtitleFile() {
    function stamp(seconds) {
        const milliseconds = Math.round(seconds * 1000);
        const pad = function (value, digits) { return String(value).padStart(digits, "0"); };
        return pad(Math.floor(milliseconds / 3600000), 2) + ":" + pad(Math.floor(milliseconds / 60000) % 60, 2) + ":" + pad(Math.floor(milliseconds / 1000) % 60, 2) + "," + pad(milliseconds % 1000, 3);
    }
    let number = 0;
    const blocks = [];
    scenes.forEach(function (scene) {
        scene.lines.forEach(function (line) {
            number++;
            blocks.push(number + "\n" + stamp(line.start) + " --> " + stamp(line.end + 0.2) + "\n" + line.text + "\n");
        });
    });
    return blocks.join("\n");
}

async function main() {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const context = canvas.getContext("2d");
    const previewAt = process.argv.indexOf("--preview");
    if (previewAt >= 0) {
        fs.mkdirSync(path.join(FILM_FOLDER, "preview"), { recursive: true });
        for (const seconds of process.argv[previewAt + 1].split(",").map(Number)) {
            await drawFrame(context, seconds);
            fs.writeFileSync(path.join(FILM_FOLDER, "preview", "parameter_frame_" + String(seconds).padStart(4, "0") + ".jpg"), canvas.toBuffer("image/jpeg", 88));
        }
        console.log("film length " + FILM_SECONDS.toFixed(1) + " s; scenes: " + scenes.map(function (scene) { return scene.name + "@" + scene.start.toFixed(1); }).join(" "));
        return;
    }
    const outputAt = process.argv.indexOf("--output");
    const outputName = outputAt >= 0 ? process.argv[outputAt + 1] : "Rome_Parameters_ZH.mp4";
    const inputs = [];
    const filters = [];
    let inputNumber = 1;
    scenes.forEach(function (scene) {
        scene.lines.forEach(function (line) {
            inputs.push("-i", path.join(VOICE_FOLDER, line.name + ".mp3"));
            filters.push("[" + inputNumber + ":a]adelay=" + Math.round(line.start * 1000) + ":all=1[a" + inputNumber + "]");
            inputNumber++;
        });
    });
    const mixInputs = [];
    for (let index = 1; index < inputNumber; index++) { mixInputs.push("[a" + index + "]"); }
    filters.push(mixInputs.join("") + "amix=inputs=" + (inputNumber - 1) + ":normalize=0,apad[voice]");
    const encoder = childProcess.spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", WIDTH + "x" + HEIGHT, "-r", String(FRAMES_PER_SECOND), "-i", "-"]
        .concat(inputs, ["-filter_complex", filters.join(";"), "-map", "0:v", "-map", "[voice]", "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-t", FILM_SECONDS.toFixed(3), path.join(FILM_FOLDER, outputName)]), { stdio: ["pipe", "inherit", "inherit"] });
    const totalFrames = Math.round(FILM_SECONDS * FRAMES_PER_SECOND);
    for (let frameNumber = 0; frameNumber < totalFrames; frameNumber++) {
        await drawFrame(context, frameNumber / FRAMES_PER_SECOND);
        const pixels = Buffer.from(context.getImageData(0, 0, WIDTH, HEIGHT).data.buffer);
        if (!encoder.stdin.write(pixels)) {
            await new Promise(function (resolve) { encoder.stdin.once("drain", resolve); });
        }
        if (frameNumber % 600 === 0) {
            console.log("frame " + frameNumber + " / " + totalFrames);
        }
    }
    encoder.stdin.end();
    await new Promise(function (resolve) { encoder.on("close", resolve); });
    fs.writeFileSync(path.join(FILM_FOLDER, outputName.replace(/\.mp4$/, ".srt")), subtitleFile());
    console.log("film length " + FILM_SECONDS.toFixed(1) + " s; wrote " + outputName);
}

main().catch(function (error) {
    console.error(error);
    process.exit(1);
});
