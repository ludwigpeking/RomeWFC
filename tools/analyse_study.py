# Reads the runs of tools/economy_study.js (tools/study/*.json) and tells, for each, whether the
# town grows, stalls or bounces back, and how varied it ends:
#   python tools/analyse_study.py
# Writes tools/pictures/study_series.png (the numbers of every run over its days),
# tools/pictures/study_table.png and tools/study/summary.txt.

import glob
import json
import os

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plot

TOOLS_FOLDER = os.path.dirname(os.path.abspath(__file__))
STUDY_FOLDER = os.path.join(TOOLS_FOLDER, 'study')
PICTURE_FOLDER = os.path.join(TOOLS_FOLDER, 'pictures')
WINDOW_DAYS = 250          # investments and other events are counted in windows of so many days
EARLY_DAYS = 1000          # the founding years, left out of the judgement of stalls
SWING_SHARE = 0.06         # a fall and a rise again of this share of the highest value is a reversal


def load_runs():
    runs = []
    for file_path in sorted(glob.glob(os.path.join(STUDY_FOLDER, '*.json'))):
        with open(file_path, encoding='utf-8') as run_file:
            runs.append(json.load(run_file))
    order = {'usual': 0}
    runs.sort(key=lambda run: (order.get(run['name'].split('_')[0], 1), run['name']))
    return runs


def series(run, name):
    return [sample[name] for sample in run['samples']]


def total_investments(sample):
    return sum(sample['investmentsOfKind'].values())


def per_window(run, values_by_sample):
    # events counted in each window, from a running total taken every so many days
    days = [sample['day'] for sample in run['samples']]
    step = days[1] - days[0]
    samples_per_window = max(1, WINDOW_DAYS // step)
    counts = []
    for end in range(samples_per_window, len(values_by_sample) + 1, samples_per_window):
        start_value = values_by_sample[end - samples_per_window - 1] if end - samples_per_window - 1 >= 0 else 0
        counts.append(values_by_sample[end - 1] - start_value)
    return counts


def reversals(values):
    # how often a value falls by a good share of its highest and then rises again by as much
    highest = max(values) if values else 0
    if highest <= 0:
        return 0
    swing = SWING_SHARE * highest
    count = 0
    direction = 0
    extreme = values[0]
    for value in values[1:]:
        if direction >= 0:
            if value > extreme:
                extreme = value
            elif extreme - value >= swing:
                if direction == 1:
                    pass
                direction = -1
                extreme = value
        if direction == -1:
            if value < extreme:
                extreme = value
            elif value - extreme >= swing:
                count += 1      # fell, and has risen again
                direction = 1
                extreme = value
    return count


def longest_stall_days(run):
    # the longest time after the founding years in which hardly anything was invested
    counts = per_window(run, [total_investments(sample) for sample in run['samples']])
    early_windows = EARLY_DAYS // WINDOW_DAYS
    later = counts[early_windows:]
    if not later:
        return 0
    usual = sorted(later)[len(later) // 2]
    threshold = max(2, 0.1 * usual)
    longest = 0
    current = 0
    for count in later:
        current = current + 1 if count < threshold else 0
        longest = max(longest, current)
    return longest * WINDOW_DAYS


def judge(run):
    samples = run['samples']
    last = samples[-1]
    def at(day, name):
        for sample in samples:
            if sample['day'] >= day:
                return sample[name]
        return last[name]
    worth_2000 = max(1, at(2000, 'worthOfAllProperty'))
    worth_4000 = max(1, at(4000, 'worthOfAllProperty'))
    acquisitions = max(1, last['acquisitions'])
    later_days = max(1, last['day'] - EARLY_DAYS)
    reversal_count = sum(reversals(series(run, name)) for name in ['households', 'houseBlocks', 'houseBlocksWithClassicalFloors', 'classicalBlocks', 'meanLandPriceOfAParcel'])
    return {
        'run': run['name'],
        'households': last['households'],
        'huts': last['hutBlocks'],
        'houses': last['houseBlocks'],
        'classical floors': last['houseBlocksWithClassicalFloors'],
        'classical': last['classicalBlocks'],
        'towers': last['towerBlocks'],
        'gardens': last['gardenPoints'],
        'worth x (2000→4000)': round(worth_4000 / worth_2000, 2),
        'worth x (4000→end)': round(last['worthOfAllProperty'] / worth_4000, 2),
        'stall days': longest_stall_days(run),
        'reversals': reversal_count,
        'bought back %': round(100 * last['boughtBack'] / acquisitions, 1),
        'demolitions /1000 d': round(1000 * last['demolitions'] / later_days, 1),
        'variety of kinds': last['kindEntropy'],
        'spread of levels': last['spreadOfLevels'],
        'worth gini': last['worthGini'],
    }


def draw_series(runs):
    panels = [
        ('households', 'households', None),
        ('house blocks', 'houseBlocks', None),
        ('house blocks with classical floors', 'houseBlocksWithClassicalFloors', None),
        ('classical blocks', 'classicalBlocks', None),
        ('mean land price of a parcel (a m²)', 'meanLandPriceOfAParcel', None),
        ('worth of all property', 'worthOfAllProperty', None),
        ('investments in each 250 days', None, 'investments'),
        ('parcels bought from neighbours in each 250 days', None, 'acquisitions'),
        ('median money of a household', 'medianMoney', None),
    ]
    figure, axes = plot.subplots(3, 3, figsize=(18, 13))
    for axis, (title, name, windowed) in zip(axes.flat, panels):
        for run in runs:
            is_usual = run['name'].startswith('usual')
            style = dict(color='#b3261e', linewidth=2.2, alpha=0.9) if is_usual else dict(color='#5b6b7a', linewidth=0.9, alpha=0.45)
            if windowed:
                if windowed == 'investments':
                    values = per_window(run, [total_investments(sample) for sample in run['samples']])
                else:
                    values = per_window(run, series(run, 'acquisitions'))
                days = [WINDOW_DAYS * (index + 1) for index in range(len(values))]
            else:
                values = series(run, name)
                days = [sample['day'] for sample in run['samples']]
            axis.plot(days, values, **style)
        axis.set_title(title, fontsize=12)
        axis.set_xlabel('day')
        axis.grid(alpha=0.25)
    figure.suptitle('The economy over 6,000 days: red, the usual parameters (three seeds); grey, one parameter set lower or higher', fontsize=14)
    figure.tight_layout(rect=(0, 0, 1, 0.97))
    figure.savefig(os.path.join(PICTURE_FOLDER, 'study_series.png'), dpi=90)


def draw_table(judgements):
    columns = list(judgements[0].keys())
    figure, axis = plot.subplots(figsize=(24, 0.42 * len(judgements) + 1.4))
    axis.axis('off')
    table = axis.table(cellText=[[str(judgement[column]) for column in columns] for judgement in judgements], colLabels=columns, loc='center', cellLoc='right')
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1, 1.35)
    for (row, column), cell in table.get_celld().items():
        if row == 0:
            cell.set_text_props(weight='bold')
            cell.set_facecolor('#ebe4d3')
        elif judgements[row - 1]['run'].startswith('usual'):
            cell.set_facecolor('#f6e3df')
    figure.tight_layout()
    figure.savefig(os.path.join(PICTURE_FOLDER, 'study_table.png'), dpi=90)


def main():
    runs = load_runs()
    if not runs:
        print('no runs in', STUDY_FOLDER)
        return
    os.makedirs(PICTURE_FOLDER, exist_ok=True)
    judgements = [judge(run) for run in runs]
    draw_series(runs)
    draw_table(judgements)
    columns = list(judgements[0].keys())
    lines = ['\t'.join(columns)] + ['\t'.join(str(judgement[column]) for column in columns) for judgement in judgements]
    with open(os.path.join(STUDY_FOLDER, 'summary.txt'), 'w', encoding='utf-8') as summary_file:
        summary_file.write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


main()
