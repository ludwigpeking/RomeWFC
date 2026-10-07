# One page of pictures of one run of the economy (a file of tools/economy_study.js, with its maps):
# how the blocks of each kind grew over the days, the map of the price of land beside the map of
# heights, height against land price, and the money of the town.
#   python tools/draw_town_report.py [run file] [picture of the town] [output]

import json
import os
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plot
from matplotlib.colors import LinearSegmentedColormap

TOOLS_FOLDER = os.path.dirname(os.path.abspath(__file__))
RUN_FILE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(TOOLS_FOLDER, 'study', 'usual_seed11.json')
TOWN_PICTURE = sys.argv[2] if len(sys.argv) > 2 else os.path.join(TOOLS_FOLDER, 'pictures', 'height_town.jpg')
OUTPUT = sys.argv[3] if len(sys.argv) > 3 else os.path.join(TOOLS_FOLDER, 'pictures', 'town_report.png')

INK = '#2b2622'
GRID = '#e6dfd0'
KIND_COLOURS = {
    'huts': '#c9a85c', 'houses': '#c4683f', 'houses with classical floors': '#8c5a8f',
    'classical': '#5b6b7a', 'gardens': '#6f8f4e',
}
PRICE_MAP = LinearSegmentedColormap.from_list('price', ['#f6ecb9', '#e8a06a', '#b3261e', '#5c1210'])
HEIGHT_MAP = LinearSegmentedColormap.from_list('height', ['#efe9dc', '#c9a85c', '#c4683f', '#6b2f1c'])

plot.rcParams.update({'font.family': 'Segoe UI', 'font.size': 11, 'axes.edgecolor': '#b9b2a3', 'axes.labelcolor': INK,
                      'xtick.color': '#6d675c', 'ytick.color': '#6d675c', 'axes.titleweight': 'bold', 'axes.titlesize': 13})


def main():
    with open(RUN_FILE, encoding='utf-8') as run_file:
        run = json.load(run_file)
    samples = run['samples']
    points = run['points']
    days = [sample['day'] for sample in samples]

    figure = plot.figure(figsize=(20, 12.5), facecolor='white')
    grid = figure.add_gridspec(3, 4, height_ratios=[1.15, 1, 1], hspace=0.42, wspace=0.28)

    # the town itself, large
    picture_axis = figure.add_subplot(grid[0, 0:2])
    if os.path.exists(TOWN_PICTURE):
        picture = plot.imread(TOWN_PICTURE)
        height, width = picture.shape[0], picture.shape[1]
        picture_axis.imshow(picture[int(height * 0.08):int(height * 0.97), int(width * 0.02):int(width * 0.98)])
    picture_axis.set_axis_off()
    last = samples[-1]
    picture_axis.set_title('Day %s: %s households, %s floors at the most' % (f"{last['day']:,}", last['households'], last['mostLevelsOfABlock']), loc='left')

    # blocks of each kind over the days
    kinds_axis = figure.add_subplot(grid[0, 2:4])
    series = {
        'huts': [sample['hutBlocks'] for sample in samples],
        'houses': [sample['houseBlocks'] for sample in samples],
        'houses with classical floors': [sample['houseBlocksWithClassicalFloors'] for sample in samples],
        'classical': [sample['classicalBlocks'] for sample in samples],
        'gardens': [sample['gardenPoints'] for sample in samples],
    }
    kinds_axis.stackplot(days, list(series.values()), labels=list(series.keys()), colors=[KIND_COLOURS[name] for name in series], alpha=0.92)
    kinds_axis.set_title('Blocks of each kind', loc='left')
    kinds_axis.set_xlabel('day')
    kinds_axis.legend(loc='upper left', frameon=False, fontsize=10)
    kinds_axis.grid(color=GRID)
    kinds_axis.set_xlim(days[0], days[-1])

    # the maps: price of land, and height
    xs = [point['x'] for point in points]
    zs = [point['z'] for point in points]
    def map_axis(position, values, colour_map, title, colour_label):
        axis = figure.add_subplot(position)
        scatter = axis.scatter(xs, zs, c=values, cmap=colour_map, marker='s', s=34, linewidths=0)
        streets = [point for point in points if point['isStreet']]
        axis.scatter([point['x'] for point in streets], [point['z'] for point in streets], c='#3a3f47', marker='s', s=6, linewidths=0)
        axis.set_aspect('equal')
        axis.invert_yaxis()
        axis.set_xticks([])
        axis.set_yticks([])
        axis.set_title(title, loc='left')
        colour_bar = figure.colorbar(scatter, ax=axis, fraction=0.046, pad=0.02)
        colour_bar.set_label(colour_label)
        return axis
    map_axis(grid[1, 0], [point['landPrice'] for point in points], PRICE_MAP, 'Price of land', 'a m²  (dark dots: streets)')
    map_axis(grid[1, 1], [point['levels'] for point in points], HEIGHT_MAP, 'Height', 'floors')

    # height against the price of land
    built = [point for point in points if point['levels'] > 0 and point['owner'] > 0]
    scatter_axis = figure.add_subplot(grid[1, 2])
    colours = [KIND_COLOURS['houses with classical floors'] if point['kind'] == 'houseWithClassicalFloors' else
               KIND_COLOURS['huts'] if point['kind'] == 'hut' else KIND_COLOURS['houses'] for point in built]
    jitter = [((index * 37) % 11 - 5) * 0.035 for index in range(len(built))]
    scatter_axis.scatter([point['landPrice'] for point in built], [point['levels'] + jitter[index] for index, point in enumerate(built)],
                         c=colours, s=14, alpha=0.75, linewidths=0)
    scatter_axis.set_xscale('symlog', linthresh=5)
    scatter_axis.set_xlabel('price of land, a m²')
    scatter_axis.set_ylabel('floors')
    scatter_axis.set_title('Height follows the price of land (r = %s)' % last.get('heightFollowsLand', '?'), loc='left')
    scatter_axis.grid(color=GRID)

    # mean floors over the days, on dear and on cheap land
    height_axis = figure.add_subplot(grid[1, 3])
    height_axis.plot(days, [sample.get('levelsOnDearLand', 0) for sample in samples], color='#b3261e', linewidth=2.2, label='dearest fifth of the land')
    height_axis.plot(days, [sample.get('levelsOnCheapLand', 0) for sample in samples], color='#c9a85c', linewidth=2.2, label='cheapest fifth')
    height_axis.plot(days, [sample['meanLevelsOfABlock'] for sample in samples], color='#6d675c', linewidth=1.4, linestyle='--', label='all')
    height_axis.set_title('Mean floors', loc='left')
    height_axis.set_xlabel('day')
    height_axis.legend(frameon=False, fontsize=10)
    height_axis.grid(color=GRID)

    # the economy: worth, rent, money, investments
    def line_axis(position, title, lines, ylabel=None):
        axis = figure.add_subplot(position)
        for label, values, colour in lines:
            axis.plot(days, values, color=colour, linewidth=2.2, label=label)
        axis.set_title(title, loc='left')
        axis.set_xlabel('day')
        if ylabel:
            axis.set_ylabel(ylabel)
        if len(lines) > 1:
            axis.legend(frameon=False, fontsize=10)
        axis.grid(color=GRID)
        return axis
    line_axis(grid[2, 0], 'Worth of all property', [('', [sample['worthOfAllProperty'] for sample in samples], '#5b6b7a')])
    line_axis(grid[2, 1], 'Mean price of land under a parcel', [('', [sample['meanLandPriceOfAParcel'] for sample in samples], '#b3261e')], 'a m²')
    line_axis(grid[2, 2], 'Money', [('median of a household', [sample['medianMoney'] for sample in samples], '#c4683f'),
                                    ('the city ÷ 100', [sample['treasury'] / 100 for sample in samples], '#5b6b7a')])
    investment_axis = figure.add_subplot(grid[2, 3])
    kinds_of_investment = {}
    for sample in samples:
        for kind in sample['investmentsOfKind']:
            kinds_of_investment[kind] = True
    window = 5  # samples (250 days)
    palette = ['#c4683f', '#c9a85c', '#8c5a8f', '#5b6b7a', '#6f8f4e', '#b3261e', '#3a3f47', '#9aa7b3', '#d9a520']
    for index, kind in enumerate(sorted(kinds_of_investment)):
        totals = [sample['investmentsOfKind'].get(kind, 0) for sample in samples]
        per_window = [totals[i] - (totals[i - window] if i >= window else 0) for i in range(len(totals))]
        if max(per_window) >= 5:
            investment_axis.plot(days, per_window, color=palette[index % len(palette)], linewidth=1.8, label=kind)
    investment_axis.set_title('Investments in each 250 days', loc='left')
    investment_axis.set_xlabel('day')
    investment_axis.legend(frameon=False, fontsize=9)
    investment_axis.grid(color=GRID)

    figure.suptitle('The economy of the town: one run of %s days (square ground of %s points, seed %s, the usual parameters)' %
                    (f"{days[-1]:,}", run.get('pointCount', len(points)), run['seed']), x=0.06, ha='left', fontsize=16, fontweight='bold', color=INK)
    figure.savefig(OUTPUT, dpi=80, bbox_inches='tight')
    print('written', OUTPUT)


main()
