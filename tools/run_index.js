// The list of the saved runs for the app (tools/runs/index.json): every run saved in tools/runs,
// in groups the Settle tab shows as such, each with a label a person can tell apart: the
// experiments (tools/experiments.js) by their design, the simulations by the ground, the seed and
// the parameters that differ from the baseline's.
//   node tools/run_index.js        writes the index again
"use strict";

const fs = require("fs");
const path = require("path");

const RUN_FOLDER = path.join(__dirname, "runs");

const GROUPS = [
  { prefix: "exp_", rank: 0, title: "Parameter experiments: one parameter turned down or up (the film)" },
  { prefix: "claim_", rank: 0.5, title: "Round 2: cheaper streets, cheaper buy-outs of neighbours (2026-10-11)" },
  { prefix: "base_", rank: 0.7, title: "Baselines of the rules by date (square 80, seed 4005)" },
  { prefix: "sim_", rank: 1, title: "Simulations of the current economy" },
  { prefix: "test_", rank: 1, title: "Simulations of the current economy" },
  { prefix: "", rank: 2, title: "Other runs" },
];

function groupOf(fileName) {
  return GROUPS.find(function (group) { return fileName.startsWith(group.prefix); });
}

function groundText(run) {
  const size = run.groundSize || {};
  if (run.ground === "square") {
    return "square " + (size.squarePointCount || "");
  }
  return "irregular " + (size.largeIrregularRingCount || "");
}

function parameterText(parameters) {
  return Object.keys(parameters).map(function (name) { return name + " " + parameters[name]; }).join(", ");
}

// what the saved town came to: households and towers
function outcomeText(run) {
  const statistics = run.statistics || {};
  const parts = [];
  if (statistics.households !== undefined) {
    parts.push(statistics.households + " households");
  }
  if (statistics.classicalBlocks !== undefined) {
    parts.push(statistics.classicalBlocks + " classical");
  }
  if (statistics.towerBlocks !== undefined) {
    parts.push(statistics.towerBlocks + " towers");
  }
  return parts.join(", ");
}

// The label of an experiment run: the experiment, the side, the parameters it changes
function experimentLabel(runName, experiments) {
  if (runName === "exp_baseline") {
    return "baseline: the defaults";
  }
  const match = /^exp_([a-z]+)_(low|high)$/.exec(runName);
  if (match === null) {
    return null;
  }
  const experiment = experiments.find(function (candidate) { return candidate.name === match[1]; });
  if (experiment === undefined) {
    return null;
  }
  const side = experiment[match[2]];
  return experiment.name + " " + match[2] + " (" + side.label + "): " + parameterText(side.parameters);
}

// The label of a simulation run: the ground, the seed, and how its parameters differ from the
// baseline's (the defaults of the day): a value changed, or a parameter the run was saved before
function simulationLabel(run, baselineParameters) {
  const parameters = run.parameters || {};
  const differences = [];
  const parametersNotYetKnown = [];
  Object.keys(Object.assign({}, baselineParameters, parameters)).forEach(function (name) {
    if (parameters[name] === baselineParameters[name]) {
      return;
    }
    if (parameters[name] === undefined) {
      parametersNotYetKnown.push(name);
    } else {
      differences.push(name + " " + parameters[name]);
    }
  });
  if (parametersNotYetKnown.length > 0) {
    differences.push("saved before " + parametersNotYetKnown.join(" and "));
  }
  return groundText(run) + ", seed " + run.seed + ", " + (differences.length > 0 ? differences.join(", ") : "defaults");
}

// Writes index.json: [{ file, group, label }], the groups in order, the runs of a group in the
// order of the experiments where there is one, else by name. Returns the count.
function writeRunIndex(experiments) {
  experiments = experiments || [];
  const baselineFile = path.join(RUN_FOLDER, "exp_baseline.json");
  const baselineParameters = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, "utf8")).parameters : {};
  function orderWithinTheGroup(fileName) {
    const runName = fileName.replace(/\.json$/, "");
    if (runName === "exp_baseline") {
      return -1;
    }
    const match = /^exp_([a-z]+)_(low|high)$/.exec(runName);
    const experimentIndex = match === null ? -1 : experiments.findIndex(function (candidate) { return candidate.name === match[1]; });
    return experimentIndex === -1 ? experiments.length * 2 : experimentIndex * 2 + (match[2] === "high" ? 1 : 0);
  }
  const savedRuns = fs.readdirSync(RUN_FOLDER).filter(function (fileName) {
    return /^[a-z]+_[a-z0-9_]+\.json$/.test(fileName) && fileName !== "index.json";
  }).map(function (fileName) {
    return { fileName: fileName, run: JSON.parse(fs.readFileSync(path.join(RUN_FOLDER, fileName), "utf8")) };
  }).sort(function (first, second) {
    return groupOf(first.fileName).rank - groupOf(second.fileName).rank
      || orderWithinTheGroup(first.fileName) - orderWithinTheGroup(second.fileName)
      || (first.run.seed || 0) - (second.run.seed || 0) || first.fileName.localeCompare(second.fileName);
  }).map(function (saved) {
    const fileName = saved.fileName;
    const run = saved.run;
    const runName = fileName.replace(/\.json$/, "");
    const group = groupOf(fileName);
    let what = null;
    if (group.prefix === "exp_") {
      what = experimentLabel(runName, experiments);
    } else if (group.prefix === "claim_") {
      const claimRun = require("./experiments").CLAIM_RUNS.find(function (candidate) { return candidate.name === runName; });
      what = claimRun ? claimRun.label + ": " + parameterText(claimRun.parameters) : null;
    } else if (group.rank === 1) {
      what = simulationLabel(run, baselineParameters);
    }
    const outcome = outcomeText(run);
    const dayText = run.dayCount ? "day " + run.dayCount : "";
    const label = what === null ? run.label : what + " · " + [dayText, outcome].filter(Boolean).join(", ");
    return { file: fileName, group: group.title, label: label, name: runName };
  });
  fs.writeFileSync(path.join(RUN_FOLDER, "index.json"), JSON.stringify(savedRuns, null, 1));
  return savedRuns.length;
}

module.exports = { writeRunIndex: writeRunIndex, RUN_FOLDER: RUN_FOLDER };

if (require.main === module) {
  console.log(writeRunIndex(require("./experiments").EXPERIMENTS) + " runs listed in tools/runs/index.json");
}
