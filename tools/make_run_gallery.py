# Makes, from the runs that tools/run_batch.js has saved in tools/runs:
#   gallery.html         a card for every run: its picture, its headline numbers, and what was
#                        set differently from the usual; sort and filter at the top, click a
#                        picture to see it large, open a card for all its numbers
#   contact_sheet.jpg    all the pictures on one sheet, with their numbers
#   python tools/make_run_gallery.py [prefix]
# prefix: the runs whose names begin so (default "run"); with another prefix the files made are
# named after it (gallery_big.html, contact_sheet_big.jpg).

import glob
import json
import os
import sys

from PIL import Image, ImageDraw

RUN_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'runs')
RUN_PREFIX = sys.argv[1] if len(sys.argv) > 1 else 'run'
SUFFIX = '' if RUN_PREFIX == 'run' else '_' + RUN_PREFIX
SHEET_COLUMN_COUNT = 10
THUMBNAIL_WIDTH = 384
THUMBNAIL_HEIGHT = 216

PAGE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Settlement runs</title>
<style>
  body { font: 15px/1.45 "Segoe UI", system-ui, sans-serif; color: #2b2622; background: #f4f0e6; margin: 0; }
  header { position: sticky; top: 0; z-index: 2; background: #f4f0e6; border-bottom: 1px solid #d8d0bf; padding: 14px 24px 12px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  header p { margin: 0 0 10px; color: #6b6257; }
  .controls { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
  .controls label { color: #6b6257; }
  select, button { font: inherit; padding: 6px 10px; border: 1px solid #b9b2a3; border-radius: 6px; background: #ffffff; cursor: pointer; }
  button.chosen { background: #3a3f47; border-color: #3a3f47; color: #ffffff; }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(440px, 1fr)); gap: 20px; padding: 20px 24px 60px; }
  .card { background: #fffdf8; border: 1px solid #d8d0bf; border-radius: 10px; overflow: hidden; }
  .card img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; cursor: zoom-in; background: #dfe7ec; }
  .cardBody { padding: 12px 16px 14px; }
  .cardTitle { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .cardTitle strong { font-size: 18px; }
  .cardTitle span { color: #6b6257; }
  .sortedBy { margin: 6px 0 0; font-size: 13px; color: #8a5a2b; }
  .headline { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
  .figure { background: #f4f0e6; border-radius: 8px; padding: 6px 8px; }
  .figure b { display: block; font-size: 19px; font-variant-numeric: tabular-nums; }
  .figure small { color: #6b6257; font-size: 12px; }
  .publicBuildings { margin: 0 0 8px; color: #4a4339; }
  .changed { margin: 0 0 8px; font-size: 13px; color: #6b6257; }
  .changed span { display: inline-block; margin: 2px 6px 2px 0; padding: 1px 8px; border-radius: 10px; background: #dfe7ec; color: #2b3a44; }
  .changed span.higher::after { content: " ▲"; color: #a2452f; }
  .changed span.lower::after { content: " ▼"; color: #2f6aa2; }
  details { margin-top: 6px; }
  summary { cursor: pointer; color: #6b6257; }
  table { border-collapse: collapse; width: 100%; margin-top: 6px; font-size: 13px; }
  td { padding: 2px 0; border-bottom: 1px solid #ece6d8; }
  td:last-child { text-align: right; font-variant-numeric: tabular-nums; padding-left: 10px; }
  .groupTitle td { border: none; padding-top: 10px; font-weight: 600; color: #6b6257; }
  #lightbox { position: fixed; inset: 0; z-index: 5; display: none; background: rgba(20, 18, 16, 0.92); align-items: center; justify-content: center; cursor: zoom-out; }
  #lightbox img { max-width: 96vw; max-height: 92vh; }
  #lightbox p { position: fixed; bottom: 8px; left: 0; right: 0; text-align: center; color: #e6dfd0; margin: 0; }
</style>
</head>
<body>
<header>
  <h1>Settlement runs</h1>
  <p id="summary"></p>
  <div class="controls">
    <label>Sort by <select id="sortList"></select></label>
    <button id="directionButton">Highest first</button>
    <span>
      <button class="groundButton chosen" data-ground="">All grounds</button>
      <button class="groundButton" data-ground="square">Square</button>
      <button class="groundButton" data-ground="largeIrregular">Irregular</button>
    </span>
  </div>
</header>
<main id="cards"></main>
<div id="lightbox"><img alt=""><p></p></div>
<script>
const RUNS = __RUNS__;

// a name of the code in plain words: 'householdsInHuts' -> 'households in huts'
function wordsOfName(name) {
  return name.replace(/([A-Z])/g, function (letter) { return ' ' + letter.toLowerCase(); });
}
function shown(value) {
  return typeof value === 'number' ? value.toLocaleString('en-GB', { maximumFractionDigits: 4 }) : String(value);
}

// what a run is sorted by: the run number, or any number among its statistics
const sortNames = ['run'];
RUNS.forEach(function (run) {
  Object.keys(run.statistics).forEach(function (name) {
    if (typeof run.statistics[name] === 'number' && sortNames.indexOf(name) === -1) {
      sortNames.push(name);
    }
  });
});
const sortList = document.getElementById('sortList');
sortNames.forEach(function (name) {
  const entry = document.createElement('option');
  entry.value = name;
  entry.textContent = name === 'run' ? 'run number' : wordsOfName(name);
  sortList.appendChild(entry);
});

// the usual value of each parameter: the one most runs have (the runs with the app's own parameters)
const usualValue = {};
const parameterNames = [];
RUNS.forEach(function (run) {
  Object.keys(run.parameters).forEach(function (name) {
    if (parameterNames.indexOf(name) === -1) {
      parameterNames.push(name);
    }
  });
});
parameterNames.forEach(function (name) {
  const countOfValue = new Map();
  RUNS.forEach(function (run) {
    const value = run.parameters[name];
    countOfValue.set(value, (countOfValue.get(value) || 0) + 1);
  });
  let mostCommon = undefined;
  let highestCount = 0;
  countOfValue.forEach(function (count, value) {
    if (count > highestCount) {
      highestCount = count;
      mostCommon = value;
    }
  });
  usualValue[name] = highestCount > 1 ? mostCommon : undefined;
});

let sortName = 'run';
let highestFirst = false;
let groundShown = '';

function figure(value, caption) {
  return '<div class="figure"><b>' + shown(value === undefined ? '–' : value) + '</b><small>' + caption + '</small></div>';
}

function cardOf(run) {
  const statistics = run.statistics;
  const groundText = run.ground === 'square'
    ? 'square' + (run.groundSize ? ' ' + run.groundSize.squarePointCount + ' × ' + run.groundSize.squarePointCount : ' 30 × 30')
    : 'irregular' + (run.groundSize ? ', ' + run.groundSize.largeIrregularRingCount + ' rings' : ', 8 rings');
  const changed = parameterNames.filter(function (name) {
    return usualValue[name] !== undefined && run.parameters[name] !== undefined && run.parameters[name] !== usualValue[name];
  }).map(function (name) {
    const isHigher = run.parameters[name] > usualValue[name];
    return '<span class="' + (isHigher ? 'higher' : 'lower') + '" title="usually ' + shown(usualValue[name]) + '">' + wordsOfName(name) + ' ' + shown(run.parameters[name]) + '</span>';
  });
  const everyParameterDrawn = parameterNames.every(function (name) { return usualValue[name] === undefined; });
  const changedText = everyParameterDrawn ? 'Every run of this batch has its own parameters: open the card to read them.'
    : changed.length === 0 ? 'The usual parameters.' : 'Set differently: ' + changed.join('');
  const monuments = Object.keys(run.monuments || {}).map(function (name) { return run.monuments[name] + ' × ' + name; }).join(', ');
  const rows = ['<tr class="groupTitle"><td colspan="2">Results</td></tr>'];
  Object.keys(statistics).forEach(function (name) {
    rows.push('<tr><td>' + wordsOfName(name) + '</td><td>' + shown(statistics[name]) + '</td></tr>');
  });
  rows.push('<tr class="groupTitle"><td colspan="2">Parameters</td></tr>');
  Object.keys(run.parameters).forEach(function (name) {
    rows.push('<tr><td>' + wordsOfName(name) + '</td><td>' + shown(run.parameters[name]) + '</td></tr>');
  });
  const sortedBy = sortName === 'run' || ['households', 'classicalBlocks'].indexOf(sortName) >= 0 ? ''
    : '<p class="sortedBy">' + wordsOfName(sortName) + ': <b>' + shown(statistics[sortName] === undefined ? '–' : statistics[sortName]) + '</b></p>';
  return '<article class="card">' +
    '<img loading="lazy" src="' + run.name + '.jpg" alt="' + run.name + '" data-caption="' + run.name + ' · seed ' + run.seed + ' · ' + groundText + '">' +
    '<div class="cardBody">' +
    '<div class="cardTitle"><strong>' + run.name.replace('_', ' ') + '</strong><span>seed ' + run.seed + ' · ' + groundText + ' · ' + shown(run.dayCount) + ' days</span></div>' +
    sortedBy +
    '<div class="headline">' +
    figure(statistics.households, 'households') +
    figure(statistics.houseBlocks, 'house blocks') +
    figure(statistics.classicalBlocks, 'classical blocks') +
    figure(statistics.towerBlocks !== undefined ? statistics.towerBlocks : statistics.hutBlocks, statistics.towerBlocks !== undefined ? 'tower blocks' : 'hut blocks') +
    '</div>' +
    (statistics.publicBuildings !== undefined ? '<p class="publicBuildings"><b>City:</b> ' + (statistics.publicBuildings || 'no public building') +
      (statistics.walls !== undefined ? ' · ' + statistics.walls + (statistics.walls === 1 ? ' wall' : ' walls') : '') + ' · ' + statistics.gates + ' gates · ' + statistics.fountains + ' fountains</p>' : '') +
    '<p class="changed">' + changedText + '</p>' +
    '<details><summary>All numbers and parameters</summary><table>' + rows.join('') + '</table>' +
    (monuments ? '<p class="changed"><b>Classical buildings found:</b> ' + monuments + '</p>' : '') + '</details>' +
    '</div></article>';
}

function showCards() {
  const runs = RUNS.filter(function (run) {
    return groundShown === '' || run.ground === groundShown;
  });
  runs.sort(function (first, second) {
    let order = 0;
    if (sortName === 'run') {
      order = first.name.localeCompare(second.name);
    } else {
      order = (first.statistics[sortName] === undefined ? -Infinity : first.statistics[sortName]) - (second.statistics[sortName] === undefined ? -Infinity : second.statistics[sortName]);
    }
    return highestFirst ? -order : order;
  });
  document.getElementById('cards').innerHTML = runs.map(cardOf).join('');
  document.getElementById('summary').textContent = runs.length + ' of ' + RUNS.length + ' runs shown. Click a picture to see it large. To walk a town in 3D, load its run in the app (Settle tab, SAVED RUNS).';
}

sortList.addEventListener('change', function () {
  sortName = sortList.value;
  highestFirst = sortName !== 'run';
  document.getElementById('directionButton').textContent = highestFirst ? 'Highest first' : 'Lowest first';
  showCards();
});
document.getElementById('directionButton').addEventListener('click', function () {
  highestFirst = !highestFirst;
  this.textContent = highestFirst ? 'Highest first' : 'Lowest first';
  showCards();
});
document.querySelectorAll('.groundButton').forEach(function (button) {
  button.addEventListener('click', function () {
    groundShown = button.dataset.ground;
    document.querySelectorAll('.groundButton').forEach(function (other) {
      other.classList.toggle('chosen', other === button);
    });
    showCards();
  });
});
const lightbox = document.getElementById('lightbox');
document.getElementById('cards').addEventListener('click', function (event) {
  if (event.target.tagName === 'IMG') {
    lightbox.querySelector('img').src = event.target.src;
    lightbox.querySelector('p').textContent = event.target.dataset.caption;
    lightbox.style.display = 'flex';
  }
});
lightbox.addEventListener('click', function () {
  lightbox.style.display = 'none';
});
document.getElementById('directionButton').textContent = 'Lowest first';
showCards();
</script>
</body>
</html>
'''


def main():
    runs = []
    for file_path in sorted(glob.glob(os.path.join(RUN_FOLDER, RUN_PREFIX + '_*.json'))):
        with open(file_path, encoding='utf-8') as run_file:
            run = json.load(run_file)
        del run['saved']
        runs.append(run)
    if not runs:
        print('no runs in', RUN_FOLDER)
        return

    # the contact sheet
    column_count = min(SHEET_COLUMN_COUNT, len(runs))
    row_count = (len(runs) + column_count - 1) // column_count
    sheet = Image.new('RGB', (column_count * THUMBNAIL_WIDTH, row_count * THUMBNAIL_HEIGHT), (240, 236, 226))
    pen = ImageDraw.Draw(sheet)
    for index, run in enumerate(runs):
        picture = Image.open(os.path.join(RUN_FOLDER, run['name'] + '.jpg')).resize((THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT), Image.LANCZOS)
        left = (index % column_count) * THUMBNAIL_WIDTH
        top = (index // column_count) * THUMBNAIL_HEIGHT
        sheet.paste(picture, (left, top))
        pen.rectangle([left, top, left + 46, top + 16], fill=(250, 248, 243))
        pen.text((left + 4, top + 3), run['name'].split('_')[-1], fill=(40, 36, 32))
    sheet_name = 'contact_sheet' + SUFFIX + '.jpg'
    sheet.save(os.path.join(RUN_FOLDER, sheet_name), quality=88)

    # the gallery: the runs as data in the page, which lays them out itself
    gallery_name = 'gallery' + SUFFIX + '.html'
    page = PAGE.replace('__RUNS__', json.dumps(runs).replace('</', '<\\/'))
    with open(os.path.join(RUN_FOLDER, gallery_name), 'w', encoding='utf-8') as gallery_file:
        gallery_file.write(page)
    print(len(runs), 'runs:', gallery_name, 'and', sheet_name, 'written to', RUN_FOLDER)


main()
