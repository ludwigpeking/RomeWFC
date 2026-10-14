// The parameter experiments: the same large town (square 80, one seed, 3000 days) run with one
// parameter turned down and turned up against the baseline of the defaults, to see which way
// each parameter pushes the town. tools/test_runs.js runs them (exp_<experiment>_<low|high>,
// exp_baseline); film/make_parameter_film.js shows them side by side.
"use strict";

const GROUND = { ground: "square", seed: 4005, pointsAlongASide: 80, ringCount: 18 };

const EXPERIMENTS = [
  {
    name: "fortune", title: "财富的随机涨落", parameter: "fortuneShareOfWealthAtMost",
    low: { label: "没有涨落", parameters: { chanceOfAFortuneEachDay: 0 } },
    high: { label: "更大的涨落", parameters: { fortuneShareOfWealthAtMost: 0.5 } },
  },
  {
    name: "rent", title: "租金率", parameter: "rentShareOfValueEachYear",
    low: { label: "更低的租金", parameters: { rentShareOfValueEachYear: 0.04 } },
    high: { label: "更高的租金", parameters: { rentShareOfValueEachYear: 0.10 } },
  },
  {
    name: "tax", title: "税率", parameter: "taxShareOfValueEachYear",
    low: { label: "更低的税", parameters: { taxShareOfValueEachYear: 0.005 } },
    high: { label: "更高的税", parameters: { taxShareOfValueEachYear: 0.03 } },
  },
  {
    name: "works", title: "公共工程的造价", parameter: "publicWorksCostScale",
    low: { label: "更便宜的工程", parameters: { publicWorksCostScale: 1.5 } },
    high: { label: "更昂贵的工程", parameters: { publicWorksCostScale: 6 } },
  },
  {
    name: "garden", title: "花园的加成", parameter: "gardenBonusForEachCell",
    low: { label: "花园加成更小", parameters: { gardenBonusForEachCell: 0.02, gardenBonusForEachCellBeyond: 0.0025 } },
    high: { label: "花园加成更大", parameters: { gardenBonusForEachCell: 0.16, gardenBonusForEachCellBeyond: 0.02 } },
  },
  {
    name: "land", title: "空地的地价", parameter: "vacantLandFactor",
    low: { label: "更便宜的空地", parameters: { vacantLandFactor: 0.5, streetLandFactor: 2 } },
    high: { label: "更昂贵的空地", parameters: { vacantLandFactor: 2.0, streetLandFactor: 8 } },
  },
  {
    name: "arrivals", title: "移民的速度", parameter: "chanceOfAnArrivalEachDay",
    low: { label: "来得更慢", parameters: { chanceOfAnArrivalEachDay: 0.25 } },
    high: { label: "来得更快", parameters: { chanceOfAnArrivalEachDay: 0.8 } },
  },
  {
    name: "towers", title: "建塔的意愿", parameter: "chanceOfRaisingATower",
    low: { label: "没有人建塔", parameters: { chanceOfRaisingATower: 0 } },
    high: { label: "人人想建塔", parameters: { chanceOfRaisingATower: 1, moneyMultipleForATower: 2 } },
  },
];

// The runs of the experiments, by name, in the form tools/test_runs.js runs
function experimentRuns() {
  const runs = { exp_baseline: Object.assign({ parameters: {} }, GROUND) };
  EXPERIMENTS.forEach(function (experiment) {
    runs["exp_" + experiment.name + "_low"] = Object.assign({ parameters: experiment.low.parameters }, GROUND);
    runs["exp_" + experiment.name + "_high"] = Object.assign({ parameters: experiment.high.parameters }, GROUND);
  });
  return runs;
}

// Round 2 (the author, 2026-10-11): more streets taken over and more neighbours bought out. The
// price of street land comes down (streetLandFactor, 4 by default: a street is worth four times
// the vacant land beside it); the premium a neighbour's property costs over its value
// (acquisitionPremium, 0.4) and the tax the buyer pays the city (transactionTaxShare, 0.05) come
// down or go. Vacant land stays cheap and the first settlement of a household stays free, as the
// author wants them. The same ground as the experiments; exp_baseline is the baseline.
const CLAIM_RUNS = [
  { name: "claim_street_half", label: "街道地价减半", parameters: { streetLandFactor: 2 } },
  { name: "claim_street_as_land", label: "街道与空地同价", parameters: { streetLandFactor: 1 } },
  { name: "claim_premium_half", label: "收购溢价减半", parameters: { acquisitionPremium: 0.2 } },
  { name: "claim_premium_none", label: "没有收购溢价", parameters: { acquisitionPremium: 0 } },
  { name: "claim_tax_none", label: "没有交易税", parameters: { transactionTaxShare: 0 } },
  { name: "claim_all_half", label: "三项都减半", parameters: { streetLandFactor: 2, acquisitionPremium: 0.2, transactionTaxShare: 0.025 } },
  { name: "claim_all_none", label: "街道同价，没有溢价和交易税", parameters: { streetLandFactor: 1, acquisitionPremium: 0, transactionTaxShare: 0 } },
];

function claimRuns() {
  const runs = {};
  CLAIM_RUNS.forEach(function (run) {
    runs[run.name] = Object.assign({ parameters: run.parameters }, GROUND);
  });
  return runs;
}

module.exports = { GROUND: GROUND, EXPERIMENTS: EXPERIMENTS, CLAIM_RUNS: CLAIM_RUNS, experimentRuns: experimentRuns, claimRuns: claimRuns };
