// A page that sets several runs side by side: the parameters that differ between them, the town
// of each at the same stages (one row for each run, one column for each stage), the numbers at
// the end, and the course of a few numbers over the days. The runs come from tools/tests/<run>
// (snapshots and numbers.jsonl) and tools/runs/<run>.json (the parameters).
//   node tools/compare_runs.js <pageName> <title> <baselineRun> <run> [<run> ...]
//     writes tools/tests/<pageName>.html
"use strict";

const fs = require("fs");
const path = require("path");

const TEST_FOLDER = path.join(__dirname, "tests");
const RUN_FOLDER = path.join(__dirname, "runs");
const STAGE_DAYS = [500, 1000, 1500, 2000, 2500, 3000];
const LAYER = "none";
const NUMBERS_AT_THE_END = [
  ["households", "households"], ["householdsInHuts", "in huts"], ["householdsInHouses", "in houses"], ["householdsClassical", "in classical houses"],
  ["hutBlocks", "hut blocks"], ["houseBlocks", "house blocks"], ["classicalBlocks", "classical blocks"], ["towerBlocks", "tower blocks"],
  ["gardenPoints", "garden points"], ["meanLevelsOfABlock", "mean levels of a block"], ["mostLevelsOfABlock", "most levels"],
  ["landUsePrivate", "land use: private, share of the map"], ["landUseStreet", "land use: street"], ["landUseOpen", "land use: open space"], ["landUsePublic", "land use: public buildings"],
  ["roadPoints", "street points (free ground with the traffic of a road)"], ["busyStreetPoints", "busy street points"], ["streetShareOfTheGroundInUse", "share of the ground in use that is street"],
  ["acquisitions", "properties bought from neighbours"], ["streetsTaken", "streets bought and built on"], ["buildingsBrokenThrough", "buildings broken through"],
  ["landSoldByTheCity", "money from land sold by the city"], ["largestHoldingPoints", "largest holding, points"], ["meanHoldingPoints", "mean holding, points"],
  ["householdsInDebt", "households in debt"], ["meanMoneyOfAHousehold", "mean money of a household"], ["taxCollected", "tax collected"], ["treasury", "treasury of the city"],
  ["publicBuildings", "public buildings (count)"],
];
const COURSES = [
  ["landUsePrivate", "land use: private, share of the map"], ["landUseStreet", "land use: street, share of the map"], ["landUseOpen", "land use: open space, share of the map"],
  ["roadPoints", "street points"], ["streetsTaken", "streets bought and built on"], ["busyStreetPoints", "busy street points"],
  ["acquisitions", "properties bought from neighbours"], ["households", "households"],
  ["classicalBlocks", "classical blocks"], ["meanLevelsOfABlock", "mean levels of a block"], ["largestHoldingPoints", "largest holding, points"],
  ["householdsInDebt", "households in debt"], ["treasury", "treasury of the city"],
];
const COLOURS = ["#d9d4c8", "#e2725b", "#8fc1d4", "#f1c66f", "#9ccc7a", "#c88ad6", "#f09cb0", "#7fd3c0", "#e0a060"];

function readRun(name) {
  const testFolder = path.join(TEST_FOLDER, name);
  const numbersFile = path.join(testFolder, "numbers.jsonl");
  const snapshots = fs.existsSync(numbersFile)
    ? fs.readFileSync(numbersFile, "utf8").split("\n").filter(Boolean).map(function (line) { return JSON.parse(line); })
    : [];
  const runFile = path.join(RUN_FOLDER, name + ".json");
  const saved = fs.existsSync(runFile) ? JSON.parse(fs.readFileSync(runFile, "utf8")) : null;
  const pictureFolder = path.join(testFolder, LAYER);
  const pictures = fs.existsSync(pictureFolder)
    ? fs.readdirSync(pictureFolder).filter(function (fileName) { return /^day_\d+\.jpg$/.test(fileName); })
    : [];
  return { name: name, snapshots: snapshots, parameters: saved ? saved.parameters : null, pictures: pictures };
}

// the picture of a run at a day: the snapshot of that day, or the last one before it
function pictureAt(run, day) {
  let found = null;
  run.pictures.forEach(function (fileName) {
    const pictureDay = Number(fileName.slice(4, 9));
    if (pictureDay <= day && (found === null || pictureDay > found.day)) {
      found = { day: pictureDay, file: run.name + "/" + LAYER + "/" + fileName };
    }
  });
  return found;
}

function numbersAt(run, day) {
  let found = null;
  run.snapshots.forEach(function (snapshot) {
    if (snapshot.day <= day && (found === null || snapshot.day > found.day)) {
      found = snapshot;
    }
  });
  return found;
}

function lastNumbersOf(run) {
  return run.snapshots.length > 0 ? run.snapshots[run.snapshots.length - 1] : null;
}

function valueOf(snapshot, key) {
  if (snapshot === null) {
    return null;
  }
  const value = key === "treasury" ? snapshot.treasury : snapshot.statistics[key];
  if (key === "publicBuildings" && typeof value === "string") {
    return value.trim() === "" ? 0 : value.trim().split(/\s+/).length;
  }
  return typeof value === "number" ? value : null;
}

function formatNumber(value) {
  if (value === null || value === undefined) {
    return "–";
  }
  if (Math.abs(value) >= 10000) {
    return Math.round(value).toLocaleString("en-US");
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// the parameters whose values differ between the runs
function differingParameters(runs) {
  const names = [];
  runs.forEach(function (run) {
    Object.keys(run.parameters || {}).forEach(function (name) {
      if (names.indexOf(name) === -1) {
        names.push(name);
      }
    });
  });
  return names.filter(function (name) {
    const values = runs.map(function (run) { return run.parameters ? run.parameters[name] : undefined; });
    return values.some(function (value) { return value !== values[0]; });
  });
}

// an SVG line chart of one number over the days, one line for each run
function courseChart(runs, key, title) {
  const width = 440;
  const height = 170;
  const left = 64;
  const bottom = 24;
  const top = 26;
  const right = 12;
  let highest = -Infinity;
  let lowest = Infinity;
  let lastDay = 0;
  runs.forEach(function (run) {
    run.snapshots.forEach(function (snapshot) {
      const value = valueOf(snapshot, key);
      if (value !== null) {
        highest = Math.max(highest, value);
        lowest = Math.min(lowest, value);
        lastDay = Math.max(lastDay, snapshot.day);
      }
    });
  });
  if (!isFinite(highest)) {
    return "";
  }
  lowest = Math.min(lowest, 0);
  if (highest === lowest) {
    highest = lowest + 1;
  }
  function xOf(day) { return left + (day / lastDay) * (width - left - right); }
  function yOf(value) { return top + (1 - (value - lowest) / (highest - lowest)) * (height - top - bottom); }
  const lines = runs.map(function (run, index) {
    const points = run.snapshots.map(function (snapshot) {
      const value = valueOf(snapshot, key);
      return value === null ? null : xOf(snapshot.day).toFixed(1) + "," + yOf(value).toFixed(1);
    }).filter(Boolean);
    const strokeWidth = index === 0 ? 2.5 : 1.6;
    return '<polyline fill="none" stroke="' + COLOURS[index % COLOURS.length] + '" stroke-width="' + strokeWidth + '" points="' + points.join(" ") + '"/>';
  });
  const zeroY = yOf(0).toFixed(1);
  return '<svg class="course" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '">' +
    '<text x="' + left + '" y="16" class="chartTitle">' + escapeHtml(title) + '</text>' +
    '<line x1="' + left + '" y1="' + zeroY + '" x2="' + (width - right) + '" y2="' + zeroY + '" stroke="#55524a"/>' +
    '<text x="' + (left - 6) + '" y="' + (top + 4) + '" class="axis" text-anchor="end">' + formatNumber(highest) + '</text>' +
    '<text x="' + (left - 6) + '" y="' + (Number(zeroY) + 4).toFixed(1) + '" class="axis" text-anchor="end">' + formatNumber(lowest) + '</text>' +
    '<text x="' + (width - right) + '" y="' + (height - 6) + '" class="axis" text-anchor="end">day ' + lastDay + '</text>' +
    lines.join("") + '</svg>';
}

function parameterTable(runs, parameterNames) {
  const head = runs.map(function (run) { return '<th class="run">' + escapeHtml(run.name) + "</th>"; }).join("");
  const rows = parameterNames.map(function (name) {
    const cells = runs.map(function (run, index) {
      const value = run.parameters ? run.parameters[name] : undefined;
      const isTheBaselines = index > 0 && runs[0].parameters !== null && value === runs[0].parameters[name];
      return '<td class="value' + (isTheBaselines ? " same" : "") + '">' + (value === undefined ? "–" : escapeHtml(value)) + "</td>";
    }).join("");
    return "<tr><th>" + escapeHtml(name) + "</th>" + cells + "</tr>";
  }).join("\n");
  const body = rows || '<tr><td class="note">the saved runs are not here yet; the parameters show once tools/runs/&lt;run&gt;.json is in</td></tr>';
  return "<table>\n<thead><tr><th></th>" + head + "</tr></thead>\n<tbody>\n" + body + "\n</tbody>\n</table>";
}

function stageTable(runs, lastDays) {
  const head = STAGE_DAYS.map(function (day) { return "<th>day " + day + "</th>"; }).join("");
  const rows = runs.map(function (run, index) {
    const cells = STAGE_DAYS.map(function (day) {
      const picture = pictureAt(run, day);
      const numbers = numbersAt(run, day);
      if (picture === null) {
        return '<td class="stage missing">not yet</td>';
      }
      const caption = numbers === null ? "" : [
        formatNumber(valueOf(numbers, "households")) + " households",
        formatNumber(valueOf(numbers, "acquisitions")) + " bought from neighbours",
        formatNumber(valueOf(numbers, "streetsTaken")) + " streets taken",
        formatNumber(valueOf(numbers, "classicalBlocks")) + " classical",
      ].join(" · ");
      const dayNote = picture.day !== day ? "day " + picture.day + " · " : "";
      return '<td class="stage"><a href="' + picture.file + '" target="_blank"><img loading="lazy" src="' + picture.file + '" alt=""></a>' +
        '<div class="caption">' + dayNote + caption + "</div></td>";
    }).join("");
    const colour = COLOURS[index % COLOURS.length];
    const baselineNote = index === 0 ? "<br><small>baseline</small>" : "";
    return '<tr><th class="runName" style="border-left-color: ' + colour + '">' + escapeHtml(run.name) + baselineNote + "<br><small>day " + lastDays[index] + "</small></th>" + cells + "</tr>";
  }).join("\n");
  return '<table class="stages">\n<thead><tr><th></th>' + head + "</tr></thead>\n<tbody>\n" + rows + "\n</tbody>\n</table>";
}

function endTable(runs, lastDays) {
  const head = runs.map(function (run, index) { return '<th class="run">' + escapeHtml(run.name) + "<br><small>day " + lastDays[index] + "</small></th>"; }).join("");
  const baselineNumbers = lastNumbersOf(runs[0]);
  const rows = NUMBERS_AT_THE_END.map(function (pair) {
    const cells = runs.map(function (run, index) {
      const value = valueOf(lastNumbersOf(run), pair[0]);
      const baselineValue = valueOf(baselineNumbers, pair[0]);
      let change = "";
      if (index > 0 && value !== null && baselineValue !== null && baselineValue !== 0) {
        const share = (value - baselineValue) / Math.abs(baselineValue);
        const direction = share > 0.02 ? "up" : share < -0.02 ? "down" : "flat";
        change = '<span class="' + direction + '">' + (share > 0 ? "+" : "") + Math.round(share * 100) + "%</span>";
      }
      return '<td class="value">' + formatNumber(value) + change + "</td>";
    }).join("");
    return "<tr><th>" + escapeHtml(pair[1]) + "</th>" + cells + "</tr>";
  }).join("\n");
  return "<table>\n<thead><tr><th></th>" + head + "</tr></thead>\n<tbody>\n" + rows + "\n</tbody>\n</table>";
}

function main() {
  const pageName = process.argv[2];
  const title = process.argv[3];
  const runNames = process.argv.slice(4);
  if (!pageName || !title || runNames.length < 2) {
    console.error("usage: node tools/compare_runs.js <pageName> <title> <baselineRun> <run> [<run> ...]");
    process.exit(1);
  }
  const runs = runNames.map(readRun);
  const parameterNames = differingParameters(runs);
  const lastDays = runs.map(function (run) { return run.snapshots.length > 0 ? run.snapshots[run.snapshots.length - 1].day : 0; });
  const legend = runs.map(function (run, index) {
    return '<span class="legend"><i style="background: ' + COLOURS[index % COLOURS.length] + '"></i>' + escapeHtml(run.name) + "</span>";
  }).join(" ");
  const charts = COURSES.map(function (pair) { return courseChart(runs, pair[0], pair[1]); }).join("\n");
  const madeOn = new Date().toISOString().slice(0, 16).replace("T", " ");
  const stageWidth = Math.floor(100 / (STAGE_DAYS.length + 1));

  const page = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    "<title>" + escapeHtml(title) + "</title>",
    "<style>",
    '  body { margin: 0; background: #1b1a18; color: #ece7dc; font: 14px/1.4 "Segoe UI", sans-serif; }',
    "  main { padding: 16px 24px 40px; }",
    "  h1 { font-size: 22px; margin: 0 0 4px; }",
    "  h2 { font-size: 16px; margin: 28px 0 8px; color: #f1c66f; }",
    "  .note { color: #a8a397; margin: 0 0 8px; }",
    "  table { border-collapse: collapse; }",
    "  th, td { padding: 4px 12px 4px 0; text-align: left; vertical-align: top; }",
    "  th.runName { font-weight: 600; white-space: nowrap; border-left: 4px solid; padding-left: 8px; }",
    "  th.runName small { color: #a8a397; font-weight: normal; }",
    "  thead th { color: #a8a397; font-weight: normal; }",
    "  thead th.run { font-weight: 600; color: #ece7dc; }",
    "  td.value { text-align: right; font-variant-numeric: tabular-nums; color: #f1c66f; white-space: nowrap; }",
    "  td.value.same { color: #6f6b62; }",
    "  td.value span { display: inline-block; width: 46px; text-align: right; font-size: 12px; margin-left: 6px; }",
    "  .up { color: #9ccc7a; } .down { color: #e2725b; } .flat { color: #6f6b62; }",
    "  .stages th, .stages td { padding: 6px 6px; }",
    "  .stages thead th { text-align: center; }",
    "  td.stage { width: " + stageWidth + "%; }",
    "  td.stage img { width: 100%; height: auto; display: block; }",
    "  td.stage.missing { color: #6f6b62; text-align: center; vertical-align: middle; }",
    "  .caption { color: #a8a397; font-size: 12px; margin-top: 3px; }",
    "  .courses { display: flex; flex-wrap: wrap; gap: 14px 24px; }",
    '  .course .chartTitle { fill: #ece7dc; font: 13px "Segoe UI", sans-serif; }',
    '  .course .axis { fill: #a8a397; font: 11px "Segoe UI", sans-serif; }',
    "  .legend { margin-right: 14px; white-space: nowrap; }",
    "  .legend i { display: inline-block; width: 14px; height: 14px; vertical-align: -2px; margin-right: 5px; }",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>" + escapeHtml(title) + "</h1>",
    '<p class="note">Square 80 ground, seed 4005, 3000 days. The first run is the baseline; a picture opens full size in a new tab. Made ' + madeOn + ".</p>",
    "<h2>Parameters that differ</h2>",
    parameterTable(runs, parameterNames),
    "<h2>The towns at each stage</h2>",
    stageTable(runs, lastDays),
    "<h2>The numbers at the end</h2>",
    '<p class="note">Beside each number, its change against the baseline.</p>',
    endTable(runs, lastDays),
    "<h2>Over the days</h2>",
    '<p class="note">' + legend + "</p>",
    '<div class="courses">',
    charts,
    "</div>",
    "</main>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(TEST_FOLDER, pageName + ".html"), page);
  console.log("tools/tests/" + pageName + ".html: " + runs.length + " runs, " + parameterNames.length + " differing parameters");
}

main();
