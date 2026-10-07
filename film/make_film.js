// Composes the film about the real estate market of the settlement: the footage of a town
// growing (film/capture_growth.js: the town and its data layers on the same frames, with the
// numbers of every frame) cut to the narration (narration.json, voice/), with the formulas, the
// counters and the charts drawn over it from those numbers, and the subtitles.
//   node make_film.js [--output name.mp4] [--preview seconds,seconds,...]
// --preview writes single frames (preview/frame_<seconds>.jpg) instead of the film.
"use strict";

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const WIDTH = 1920;
const HEIGHT = 1080;
const FRAMES_PER_SECOND = 30;
const FILM_FOLDER = __dirname;
const FOOTAGE_FOLDER = path.join(FILM_FOLDER, "footage_raw");
const PAUSE_BETWEEN_LINES = 0.35;
const PAUSE_BETWEEN_SCENES = 1.1;
const TITLE_SECONDS = 4.0;
const CREDIT_SECONDS = 4.5;

// the film's own names (the title is provisional until the author gives one)
const FILM_TITLE = ["算法生成城市", "先有一个房地产市场"];
const FILM_SUBTITLE = "A real estate market, simulated from the bottom up";
const FILM_BYLINE = "Richard Qian Li 陈腐粉碎机";

GlobalFonts.registerFromPath(path.join(FILM_FOLDER, "fonts", "msyh.ttc"), "Film");
GlobalFonts.registerFromPath(path.join(FILM_FOLDER, "fonts", "msyhbd.ttc"), "FilmBold");
GlobalFonts.registerFromPath(path.join(FILM_FOLDER, "fonts", "consola.ttf"), "FilmMono");

const INK = "#f7f3ea";
const SOFT_INK = "rgba(247, 243, 234, 0.72)";
const ACCENT = "#f0b35a";
const SERIES_COLOURS = ["#f0b35a", "#e2725b", "#8fc1d4", "#b9d38a", "#c9a2d8", "#f7f3ea"];

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function ramp(time, startTime, durationSeconds) { return clamp01((time - startTime) / durationSeconds); }
function ease(value) { const x = clamp01(value); return x * x * (3 - 2 * x); }
function mix(from, to, amount) { return from + (to - from) * amount; }

// ---------------------------------------------------------------------------
// The narration: when each line is spoken
// ---------------------------------------------------------------------------
const narration = JSON.parse(fs.readFileSync(path.join(FILM_FOLDER, "narration.json"), "utf8"));
const scenes = []; // { name, title, start, end, lines: [{ start, end, text, name }] }
(function layOutTheNarration() {
    let time = TITLE_SECONDS;
    narration.forEach(function (line) {
        const sceneName = line.name.split("_")[0];
        let scene = scenes[scenes.length - 1];
        if (!scene || scene.name !== sceneName) {
            if (scene) {
                scene.end = time + PAUSE_BETWEEN_SCENES / 2;
                time += PAUSE_BETWEEN_SCENES;
            }
            scene = { name: sceneName, title: line.scene, start: time - (scenes.length === 0 ? 0 : PAUSE_BETWEEN_SCENES / 2), lines: [] };
            scenes.push(scene);
        }
        scene.lines.push({ name: line.name, text: line.zh, start: time, end: time + line.duration });
        time += line.duration + PAUSE_BETWEEN_LINES;
    });
    scenes[scenes.length - 1].end = time + 1.0;
}());
const FILM_SECONDS = scenes[scenes.length - 1].end + CREDIT_SECONDS;

function sceneAt(time) {
    return scenes.find(function (scene) { return time >= scene.start && time < scene.end; }) || null;
}
// when a line of a scene begins (lines counted from 1), or the end of the scene past its last line
function lineStart(scene, lineNumber) {
    return lineNumber <= scene.lines.length ? scene.lines[lineNumber - 1].start : scene.end;
}

// ---------------------------------------------------------------------------
// The footage and its numbers
// ---------------------------------------------------------------------------
const frameDataOfShot = new Map();
function frameData(shotName) {
    if (!frameDataOfShot.has(shotName)) {
        const filePath = path.join(FOOTAGE_FOLDER, shotName, "frames.jsonl");
        const frames = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).map(function (text) { return JSON.parse(text); }) : [];
        frameDataOfShot.set(shotName, frames);
    }
    return frameDataOfShot.get(shotName);
}
function frameCount(shotName) {
    return Math.max(1, frameData(shotName).length);
}
function frameNumberAt(shotName, progress) {
    return 1 + Math.round(clamp01(progress) * (frameCount(shotName) - 1));
}
const imageCache = new Map();
async function footage(shotName, layerName, progress) {
    const frameNumber = frameNumberAt(shotName, progress);
    const filePath = path.join(FOOTAGE_FOLDER, shotName, layerName, "frame_" + String(frameNumber).padStart(5, "0") + ".jpg");
    if (!imageCache.has(filePath)) {
        if (imageCache.size > 40) {
            imageCache.delete(imageCache.keys().next().value);
        }
        imageCache.set(filePath, fs.existsSync(filePath) ? await loadImage(filePath) : null);
    }
    return imageCache.get(filePath);
}
function numbersAt(shotName, progress) {
    const frames = frameData(shotName);
    return frames.length > 0 ? frames[frameNumberAt(shotName, progress) - 1] : null;
}
// the kinds of investment made up to a frame, as counts
function investmentsAt(frame) {
    try {
        return JSON.parse(frame.statistics.investments || "{}");
    } catch (error) {
        return {};
    }
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
    context.font = size + "px " + (settings.mono ? "FilmMono" : settings.bold ? "FilmBold" : "Film");
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
// a dark veil over the left of the picture (for words) or over its foot (for charts and subtitles)
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
// a formula: its parts appear one after another
function formula(context, parts, x, y, size, time, startTime) {
    let cursor = x;
    context.save();
    context.font = size + "px FilmBold";
    parts.forEach(function (part, index) {
        const alpha = ease(ramp(time, startTime + index * 0.35, 0.5));
        const isSign = /^[=×−+Σ%]+$/.test(part.trim());
        text(context, part, cursor, y, size, isSign ? SOFT_INK : (index === 0 ? ACCENT : INK), { bold: true, alpha: alpha });
        cursor += context.measureText(part).width + size * 0.32;
    });
    context.restore();
}
function chapterTitle(context, scene, time) {
    const alpha = ease(ramp(time, scene.start + 0.2, 0.6)) * (1 - ease(ramp(time, scene.start + 4.2, 0.8)));
    if (alpha <= 0) {
        return;
    }
    text(context, scene.title, 96, 120, 46, INK, { bold: true, alpha: alpha });
}
// a number with its caption, counting along with the footage
function counter(context, value, caption, x, y, alpha) {
    text(context, typeof value === "number" ? Math.round(value).toLocaleString("en-US") : String(value), x, y, 54, INK, { bold: true, alpha: alpha });
    text(context, caption, x, y + 36, 24, SOFT_INK, { alpha: alpha });
}
// a chart of lines over the days of the footage, drawn up to a frame
function lineChart(context, box, shotName, progress, seriesList, title, alpha) {
    const frames = frameData(shotName);
    if (frames.length < 2 || alpha <= 0) {
        return;
    }
    const lastFrame = frameNumberAt(shotName, progress);
    const lastDay = frames[frames.length - 1].day;
    let highest = 1;
    seriesList.forEach(function (series) {
        frames.forEach(function (frame) { highest = Math.max(highest, series.valueOf(frame)); });
    });
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = "rgba(18, 17, 16, 0.62)";
    context.fillRect(box.x - 24, box.y - 54, box.width + 48, box.height + 96);
    text(context, title, box.x, box.y - 18, 26, INK, { bold: true, shadow: false });
    context.strokeStyle = "rgba(247, 243, 234, 0.28)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(box.x, box.y + box.height);
    context.lineTo(box.x + box.width, box.y + box.height);
    context.stroke();
    seriesList.forEach(function (series, seriesIndex) {
        context.strokeStyle = SERIES_COLOURS[seriesIndex % SERIES_COLOURS.length];
        context.lineWidth = 4;
        context.lineJoin = "round";
        context.beginPath();
        let lastX = box.x;
        let lastY = box.y + box.height;
        for (let frameIndex = 0; frameIndex < lastFrame; frameIndex += 2) {
            const frame = frames[frameIndex];
            lastX = box.x + box.width * frame.day / Math.max(1, lastDay);
            lastY = box.y + box.height * (1 - series.valueOf(frame) / highest);
            if (frameIndex === 0) { context.moveTo(lastX, lastY); } else { context.lineTo(lastX, lastY); }
        }
        context.stroke();
        text(context, series.label, Math.min(lastX + 10, box.x + box.width - 10), lastY - 8 - (seriesIndex % 2) * 4, 22,
            SERIES_COLOURS[seriesIndex % SERIES_COLOURS.length], { shadow: false, align: lastX > box.x + box.width * 0.8 ? "right" : "left" });
    });
    text(context, "第 " + frames[lastFrame - 1].day + " 天", box.x + box.width, box.y + box.height + 30, 22, SOFT_INK, { align: "right", shadow: false });
    context.restore();
}
// bars side by side, each of segments stacked: for values split into their parts
function stackedBars(context, box, bars, alpha, grow) {
    if (alpha <= 0) {
        return;
    }
    let highest = 1;
    bars.forEach(function (bar) {
        highest = Math.max(highest, bar.segments.reduce(function (sum, segment) { return sum + segment.value; }, 0));
    });
    const barWidth = Math.min(150, box.width / bars.length * 0.55);
    context.save();
    context.globalAlpha = alpha;
    bars.forEach(function (bar, barIndex) {
        const centreX = box.x + box.width * (barIndex + 0.5) / bars.length;
        let top = box.y + box.height;
        bar.segments.forEach(function (segment) {
            const height = box.height * segment.value / highest * grow;
            top -= height;
            context.fillStyle = segment.colour;
            context.fillRect(centreX - barWidth / 2, top, barWidth, height);
            if (height > 34) {
                text(context, segment.label, centreX, top + height / 2 + 8, 22, "#1d1b19", { align: "center", shadow: false, bold: true });
            }
        });
        text(context, bar.label, centreX, box.y + box.height + 34, 24, INK, { align: "center" });
    });
    context.restore();
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
    // long lines are broken in two near a punctuation mark
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

// ---------------------------------------------------------------------------
// The scenes. G: the town growing, the camera going round; S: the same town, the camera still.
// ---------------------------------------------------------------------------
const G = "squareGrowth";
const S = "squareGrowthStill";

// one layer of a shot fading into another at a time
async function layers(context, shotName, progress, time, cuts) {
    // cuts: [{ layer, at }] in the order of their times; each fades in over the one before
    for (let index = 0; index < cuts.length; index++) {
        const alpha = index === 0 ? 1 : ease(ramp(time, cuts[index].at, 0.9));
        if (alpha > 0) {
            drawImageCover(context, await footage(shotName, cuts[index].layer, progress), alpha);
        }
    }
}
function sceneProgress(scene, time) {
    return clamp01((time - scene.start) / (scene.end - scene.start));
}

const SCENE_DRAWERS = {
    // the opening: the town grows; the buildings fade and the value of the locations shows
    s00: async function (context, scene, time) {
        const progress = mix(0.0, 1.0, sceneProgress(scene, time));
        await layers(context, G, progress, time, [{ layer: "none", at: 0 }, { layer: "location", at: lineStart(scene, 4) }, { layer: "none", at: lineStart(scene, 6) }]);
        veilFoot(context, 1);
        const frame = numbersAt(G, progress);
        if (frame) {
            counter(context, frame.day, "天", WIDTH - 420, 110, 0.95);
            counter(context, frame.statistics.households, "户人家", WIDTH - 230, 110, 0.95);
        }
    },
    // location: traffic, security, and their product
    s01: async function (context, scene, time) {
        const progress = mix(0.25, 0.95, sceneProgress(scene, time));
        const threeAt = lineStart(scene, 6);
        if (time < threeAt + 0.9) {
            await layers(context, S, progress, time, [{ layer: "none", at: 0 }, { layer: "traffic", at: lineStart(scene, 2) - 0.4 }, { layer: "security", at: lineStart(scene, 5) - 0.4 }]);
        }
        const threeAlpha = ease(ramp(time, threeAt, 0.9));
        if (threeAlpha > 0) {
            context.fillStyle = "rgba(18, 17, 16, " + threeAlpha + ")";
            context.fillRect(0, 0, WIDTH, HEIGHT);
            const panelWidth = 560;
            const panelHeight = 560;
            const gap = 70;
            const left = (WIDTH - 3 * panelWidth - 2 * gap) / 2;
            const names = [["traffic", "交通"], ["security", "安全"], ["location", "位置价值"]];
            for (let index = 0; index < 3; index++) {
                const box = { x: left + index * (panelWidth + gap), y: 190, width: panelWidth, height: panelHeight };
                drawImageCover(context, await footage(S, names[index][0], progress), threeAlpha * ease(ramp(time, threeAt + index * 0.5, 0.6)), box);
                text(context, names[index][1], box.x + panelWidth / 2, box.y + panelHeight + 60, 40, index === 2 ? ACCENT : INK, { bold: true, align: "center", alpha: threeAlpha });
                if (index < 2) {
                    text(context, index === 0 ? "×" : "=", box.x + panelWidth + gap / 2, box.y + panelHeight / 2 + 20, 60, SOFT_INK, { bold: true, align: "center", alpha: threeAlpha });
                }
            }
        } else {
            veilLeft(context, 0.9);
            const first = time < lineStart(scene, 5) - 0.4;
            text(context, first ? "交通值" : "安全值", 96, 250, 64, ACCENT, { bold: true, alpha: ease(ramp(time, lineStart(scene, 2) - 0.2, 0.6)) });
            if (first) {
                text(context, "出行途经的点：+ 权重", 96, 320, 30, INK, { alpha: ease(ramp(time, lineStart(scene, 2) + 1.0, 0.6)) });
                text(context, "紧邻的点：+ 权重的一半", 96, 366, 30, INK, { alpha: ease(ramp(time, lineStart(scene, 2) + 2.2, 0.6)) });
                text(context, "一段路的通行成本 = 1/(2n) + 0.5", 96, 450, 30, INK, { mono: false, alpha: ease(ramp(time, lineStart(scene, 3), 0.6)) });
                text(context, "n：这段路被走过的次数；成本最低降到一半", 96, 494, 26, SOFT_INK, { alpha: ease(ramp(time, lineStart(scene, 3) + 0.8, 0.6)) });
            } else {
                text(context, "一户人家：周围的安全值增加", 96, 320, 30, INK, { alpha: ease(ramp(time, lineStart(scene, 5) + 0.6, 0.6)) });
                text(context, "公共建筑：增加得更多", 96, 366, 30, INK, { alpha: ease(ramp(time, lineStart(scene, 5) + 2.6, 0.6)) });
            }
        }
        chapterTitle(context, scene, time);
    },
    // the two values
    s02: async function (context, scene, time) {
        const progress = mix(0.55, 0.95, sceneProgress(scene, time));
        await layers(context, S, progress, time, [{ layer: "none", at: 0 }, { layer: "height", at: lineStart(scene, 2) + 1.5 }, { layer: "worth", at: lineStart(scene, 3) }]);
        veilLeft(context, 1);
        formula(context, ["建筑价值", "=", "Σ 面积", "×", "单位造价", "×", "楼层与档次的加价"], 96, 300, 38, time, lineStart(scene, 2) + 1.0);
        formula(context, ["房产价值", "=", "Σ 面积", "×", "交通", "×", "安全", "×", "效用"], 96, 420, 38, time, lineStart(scene, 3) + 0.6);
        text(context, "效用：楼层越高越低；不临街的地块更低", 96, 480, 28, SOFT_INK, { alpha: ease(ramp(time, lineStart(scene, 5), 0.6)) });
        // the floors of one house: cost rising, utility falling (the numbers of the model)
        const floorsAlpha = ease(ramp(time, lineStart(scene, 2) + 2.2, 0.8));
        if (floorsAlpha > 0) {
            const left = 96;
            const foot = 900;
            for (let level = 0; level < 6; level++) {
                const costWidth = 150 * Math.pow(1.25, level) / Math.pow(1.25, 5);
                const utilityWidth = 150 * Math.pow(0.8, level);
                const y = foot - level * 46;
                const rowAlpha = floorsAlpha * ease(ramp(time, lineStart(scene, 2) + 2.2 + level * 0.18, 0.4));
                context.save();
                context.globalAlpha = rowAlpha;
                context.fillStyle = "#e2725b";
                context.fillRect(left + 90, y - 30, costWidth, 30);
                context.fillStyle = ACCENT;
                context.globalAlpha = rowAlpha * ease(ramp(time, lineStart(scene, 5), 0.6));
                context.fillRect(left + 290, y - 30, utilityWidth, 30);
                context.restore();
                text(context, (level + 1) + " 层", left, y - 6, 24, INK, { alpha: rowAlpha });
            }
            text(context, "造价", left + 90, foot + 34, 24, "#e2725b", { alpha: floorsAlpha });
            text(context, "效用", left + 290, foot + 34, 24, ACCENT, { alpha: floorsAlpha * ease(ramp(time, lineStart(scene, 5), 0.6)) });
        }
        chapterTitle(context, scene, time);
    },
    // land price as the residual
    s03: async function (context, scene, time) {
        const progress = mix(0.6, 1.0, sceneProgress(scene, time));
        await layers(context, S, progress, time, [{ layer: "worth", at: 0 }, { layer: "landPrice", at: lineStart(scene, 1) + 1.0 }]);
        veilLeft(context, 1);
        formula(context, ["地价", "=", "房产价值", "−", "建筑价值"], 96, 300, 44, time, lineStart(scene, 1) + 0.3);
        // the same building on two locations: the building part alike, the land part not
        const barsAlpha = ease(ramp(time, lineStart(scene, 2), 0.7));
        stackedBars(context, { x: 96, y: 420, width: 620, height: 420 }, [
            { label: "人流多的位置", segments: [{ value: 3, colour: "#8fc1d4", label: "建筑" }, { value: 7, colour: ACCENT, label: "地" }] },
            { label: "人流少的位置", segments: [{ value: 3, colour: "#8fc1d4", label: "建筑" }, { value: 1.2, colour: ACCENT, label: "地" }] },
        ], barsAlpha, ease(ramp(time, lineStart(scene, 2), 1.4)));
        text(context, "示意：同一栋建筑，两个位置", 96, 920, 24, SOFT_INK, { alpha: barsAlpha });
        chapterTitle(context, scene, time);
    },
    // a household's books
    s04: async function (context, scene, time) {
        const progress = mix(0.45, 0.85, sceneProgress(scene, time));
        await layers(context, G, progress, time, [{ layer: "none", at: 0 }, { layer: "rent", at: lineStart(scene, 2) }]);
        veilLeft(context, 1);
        formula(context, ["年租金", "=", "房产价值", "×", "7%"], 96, 300, 44, time, lineStart(scene, 2) + 0.3);
        const outAlpha = ease(ramp(time, lineStart(scene, 3), 0.6));
        text(context, "− 税：按房产价值", 96, 390, 34, INK, { alpha: outAlpha });
        text(context, "− 维护费：按建筑价值，古典建筑费率更高", 96, 440, 34, INK, { alpha: ease(ramp(time, lineStart(scene, 3) + 2.4, 0.6)) });
        text(context, "+ 农户：农田的收成", 96, 490, 34, INK, { alpha: ease(ramp(time, lineStart(scene, 4), 0.6)) });
        const frame = numbersAt(G, progress);
        if (frame) {
            const numbersAlpha = ease(ramp(time, lineStart(scene, 2) + 1.5, 0.8));
            counter(context, frame.statistics.worthOfAllProperty, "全城房产价值", 96, 680, numbersAlpha);
            counter(context, frame.statistics.rentOfAllEachDay * 360, "全城一年的租金与农田收成", 96, 810, numbersAlpha);
        }
        chapterTitle(context, scene, time);
    },
    // where the money goes
    s05: async function (context, scene, time) {
        const progress = mix(0.2, 1.0, sceneProgress(scene, time));
        await layers(context, G, progress, time, [{ layer: "none", at: 0 }, { layer: "height", at: lineStart(scene, 4) }, { layer: "location", at: lineStart(scene, 5) },
            { layer: "height", at: lineStart(scene, 5) + 3.2 }, { layer: "owners", at: lineStart(scene, 7) }]);
        veilLeft(context, 0.85);
        const kinds = [["buildUp", "加层"], ["rebuildAsHouse", "翻建为住宅"], ["buyLandAndBuild", "买地新建"], ["acquire", "买下别人的房产"], ["classicalGroundFloor", "底层改古典"], ["garden", "花园"]];
        lineChart(context, { x: 120, y: 250, width: 640, height: 380 }, G, progress, kinds.map(function (kind) {
            return { label: kind[1], valueOf: function (frame) { return investmentsAt(frame)[kind[0]] || 0; } };
        }), "投资的累计次数", ease(ramp(time, lineStart(scene, 2), 0.8)));
        text(context, "选：租金增加 ÷ 投入 最高的一项", 96, 760, 34, ACCENT, { bold: true, alpha: ease(ramp(time, lineStart(scene, 3), 0.6)) });
        text(context, "每层造价更高，效用更低；住宅最多六层", 96, 812, 28, INK, { alpha: ease(ramp(time, lineStart(scene, 4), 0.6)) });
        text(context, "买别人的房产：溢价 30% + 交易税", 96, 858, 28, INK, { alpha: ease(ramp(time, lineStart(scene, 7), 0.6)) });
        const layerName = time < lineStart(scene, 4) ? "" : time < lineStart(scene, 5) ? "楼的高度" : time < lineStart(scene, 5) + 3.2 ? "位置价值" : time < lineStart(scene, 7) ? "楼的高度" : "产权";
        text(context, layerName, WIDTH - 96, 120, 40, INK, { bold: true, align: "right" });
        chapterTitle(context, scene, time);
    },
    // classical is hard
    s06: async function (context, scene, time) {
        const progress = mix(0.7, 1.0, sceneProgress(scene, time));
        await layers(context, G, progress, time, [{ layer: "none", at: 0 }]);
        veilLeft(context, 0.9);
        const frame = numbersAt(G, progress);
        if (frame) {
            counter(context, frame.statistics.houseBlocksWithClassicalFloors, "有古典楼层的住宅地块", 96, 330, ease(ramp(time, lineStart(scene, 1) + 1.0, 0.6)));
            counter(context, frame.statistics.houseBlocks, "普通住宅地块", 96, 460, ease(ramp(time, lineStart(scene, 1) + 1.4, 0.6)));
            counter(context, frame.statistics.classicalBlocks, "整栋古典的地块", 96, 590, ease(ramp(time, lineStart(scene, 4), 0.6)));
        }
        text(context, "价值的提高：只对头一两处有效", 96, 740, 32, ACCENT, { bold: true, alpha: ease(ramp(time, lineStart(scene, 2), 0.6)) });
        text(context, "造价和维护费：每一处都要付", 96, 790, 32, INK, { alpha: ease(ramp(time, lineStart(scene, 3), 0.6)) });
        chapterTitle(context, scene, time);
    },
    // gardens, streets, demolition
    s07: async function (context, scene, time) {
        const progress = mix(0.4, 1.0, sceneProgress(scene, time));
        await layers(context, G, progress, time, [{ layer: "none", at: 0 }, { layer: "traffic", at: lineStart(scene, 3) }, { layer: "pressure", at: lineStart(scene, 5) }]);
        veilLeft(context, 0.9);
        const frame = numbersAt(G, progress);
        text(context, "花园：相邻房产的租金 + 15%", 96, 300, 36, ACCENT, { bold: true, alpha: ease(ramp(time, lineStart(scene, 2), 0.6)) * (1 - ease(ramp(time, lineStart(scene, 3), 0.6))) });
        text(context, "买街道：价格 + 两倍价格的溢价", 96, 300, 36, ACCENT, { bold: true, alpha: ease(ramp(time, lineStart(scene, 3), 0.6)) * (1 - ease(ramp(time, lineStart(scene, 5), 0.6))) });
        text(context, "穿过建筑的成本很高；拆除能明显降低出行成本时，城市拆除并赔偿", 96, 300, 30, ACCENT, { bold: true, alpha: ease(ramp(time, lineStart(scene, 5), 0.6)) });
        if (frame) {
            counter(context, frame.statistics.gardenPoints, "花园地块", 96, 470, ease(ramp(time, lineStart(scene, 1) + 0.8, 0.6)));
            counter(context, frame.statistics.buildingsBrokenThrough, "为打通道路拆除的建筑", 96, 600, ease(ramp(time, lineStart(scene, 4), 0.6)));
        }
        const layerName = time < lineStart(scene, 3) ? "" : time < lineStart(scene, 5) ? "人走过的路" : "建筑受到的拆除压力";
        text(context, layerName, WIDTH - 96, 120, 40, INK, { bold: true, align: "right" });
        chapterTitle(context, scene, time);
    },
    // the home
    s08: async function (context, scene, time) {
        const progress = mix(0.5, 1.0, sceneProgress(scene, time));
        await layers(context, S, progress, time, [{ layer: "none", at: 0 }, { layer: "owners", at: lineStart(scene, 1) + 0.6 }]);
        veilLeft(context, 0.9);
        text(context, "家 = 名下价值最高的一处房产", 96, 300, 40, ACCENT, { bold: true, alpha: ease(ramp(time, lineStart(scene, 1) + 0.3, 0.6)) });
        text(context, "房产越分散，管理的损耗越大", 96, 370, 32, INK, { alpha: ease(ramp(time, lineStart(scene, 2), 0.6)) });
        text(context, "一种颜色 = 一户人家的地产", WIDTH - 96, 120, 34, INK, { bold: true, align: "right", alpha: ease(ramp(time, lineStart(scene, 1) + 1.2, 0.6)) });
        chapterTitle(context, scene, time);
    },
    // the city
    s09: async function (context, scene, time) {
        const progress = mix(0.15, 1.0, sceneProgress(scene, time));
        await layers(context, G, progress, time, [{ layer: "none", at: 0 }, { layer: "works", at: lineStart(scene, 3) }, { layer: "security", at: lineStart(scene, 4) }]);
        veilLeft(context, 0.9);
        lineChart(context, { x: 120, y: 260, width: 640, height: 340 }, G, progress, [
            { label: "卖地", valueOf: function (frame) { return frame.statistics.landSoldByTheCity; } },
            { label: "卖地 + 税", valueOf: function (frame) { return frame.statistics.taxCollected; } },
            { label: "支出", valueOf: function (frame) { return frame.statistics.moneySpentByTheCity; } },
        ], "城市的账（累计）", ease(ramp(time, lineStart(scene, 1) + 0.8, 0.8)));
        // what the city built, as it happens
        const frames = frameData(G);
        const lastFrame = frameNumberAt(G, progress);
        const events = [];
        for (let frameIndex = 0; frameIndex < lastFrame; frameIndex++) {
            (frames[frameIndex].events || []).forEach(function (event) {
                const kind = event.text.split(" ")[0];
                const names = { temple: "神庙", cityArch: "凯旋门", basilica: "巴西利卡", theatre: "剧场", amphitheatre: "斗兽场", pantheon: "万神殿", circus: "竞技场", wall: "城墙", fountain: "喷泉" };
                if (names[kind] && kind !== "fountain") {
                    events.push("第 " + event.day + " 天  " + names[kind]);
                }
            });
        }
        events.slice(-7).forEach(function (line, index) {
            text(context, line, 120, 730 + index * 36, 26, INK, { alpha: ease(ramp(time, lineStart(scene, 3), 0.6)) });
        });
        chapterTitle(context, scene, time);
    },
    // the result
    s10: async function (context, scene, time) {
        const progress = mix(0.9, 1.0, sceneProgress(scene, time));
        await layers(context, G, progress, time, [{ layer: "none", at: 0 }, { layer: "location", at: lineStart(scene, 2) - 0.3 }, { layer: "height", at: lineStart(scene, 2) + 2.6 }, { layer: "none", at: lineStart(scene, 3) }]);
        veilFoot(context, 1);
        const layerName = time < lineStart(scene, 2) - 0.3 ? "" : time < lineStart(scene, 2) + 2.6 ? "位置价值" : time < lineStart(scene, 3) ? "楼的高度" : "";
        text(context, layerName, WIDTH - 96, 120, 40, INK, { bold: true, align: "right" });
        chapterTitle(context, scene, time);
    },
};

async function drawFrame(context, time) {
    context.fillStyle = "#121110";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    if (time < TITLE_SECONDS + 0.8) {
        // the title over the grown town
        drawImageCover(context, await footage(G, "none", 1), 1);
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
        await SCENE_DRAWERS[scene.name](context, scene, time);
        veilFoot(context, 0.8);
        subtitle(context, time);
        context.restore();
        return;
    }
    // the end: the town, and who made it
    drawImageCover(context, await footage(G, "none", 1), 1);
    veilLeft(context, 1);
    text(context, FILM_BYLINE, 120, 520, 54, INK, { bold: true });
    text(context, "模拟与画面：romeWFC（本片所有画面和数字都来自同一次模拟）", 124, 600, 28, SOFT_INK);
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
            fs.writeFileSync(path.join(FILM_FOLDER, "preview", "frame_" + String(seconds).padStart(4, "0") + ".jpg"), canvas.toBuffer("image/jpeg", 88));
        }
        console.log("film length " + FILM_SECONDS.toFixed(1) + " s; scenes: " + scenes.map(function (scene) { return scene.name + "@" + scene.start.toFixed(1); }).join(" "));
        return;
    }
    const outputAt = process.argv.indexOf("--output");
    const outputName = outputAt >= 0 ? process.argv[outputAt + 1] : "Rome_Real_Estate_ZH.mp4";
    // the narration as one track: each line at its time
    const inputs = [];
    const filters = [];
    let inputNumber = 1;
    scenes.forEach(function (scene) {
        scene.lines.forEach(function (line) {
            inputs.push("-i", path.join(FILM_FOLDER, "voice", line.name + ".mp3"));
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
