# Paints textures/atlas.png, the one small picture all the materials of the town are taken from,
# and textures/atlas.json, which tells where each material lies in it:
#   python tools/make_atlas.py
# The picture is a grid of square tiles, one for each material. A tile is repeated over the
# surfaces of its material (the window tile is laid once into every window). The picture may be
# painted over by hand afterwards; running this script again overwrites it.

import json
import os
import random

from PIL import Image

TILE_SIZE_PIXELS = 32
COLUMN_COUNT = 8
ROW_COUNT = 5

# name: (colour, kind of pattern, metres of surface one tile covers)
MATERIALS = [
    ('stone', 0xe9e2d0, 'ashlar', 1.6),
    ('stoneShade', 0xcfc5ac, 'ashlar', 1.6),
    ('tile', 0xb4573a, 'roofTiles', 1.6),
    ('bronze', 0x7d6a3a, 'plain', 1.0),
    ('plasterOchre', 0xdcb779, 'plaster', 3.2),
    ('plasterRose', 0xd9a48c, 'plaster', 3.2),
    ('plasterCream', 0xe6d6b5, 'plaster', 3.2),
    ('plasterSienna', 0xc98f5e, 'plaster', 3.2),
    ('interior', 0x2b2622, 'flat', 1.0),
    ('person', 0x1f4e8c, 'flat', 1.0),
    ('timber', 0x7b5a3a, 'grain', 1.0),
    ('plank', 0xa98a5f, 'boards', 1.2),
    ('thatch', 0x7c725a, 'thatch', 1.0),
    # awnings: undyed linen, coarse hemp, and a cloth dyed with madder and faded by the sun
    ('canvasMadder', 0xa9705a, 'cloth', 1.0),
    ('canvasHemp', 0xa39577, 'cloth', 1.0),
    ('canvasLinen', 0xd9cfb4, 'cloth', 1.0),
    ('water', 0x5d8fa6, 'plain', 2.0),
    ('volumeClassical', 0xe9e2d0, 'flat', 1.0),
    ('volumeVernacular', 0xdcb779, 'flat', 1.0),
    ('volumeTemporary', 0xa98a5f, 'flat', 1.0),
    ('brick', 0xb9744f, 'bricks', 0.96),
    ('brickPale', 0xcfa06c, 'bricks', 0.96),
    ('cobble', 0x9c9484, 'cobbles', 1.6),
    ('paving', 0x77716a, 'paving', 2.4),
    ('roughStone', 0xa8906c, 'roughStone', 1.6),
    ('grass', 0x8a9a5b, 'grass', 2.0),
    ('leaf', 0x4d6b3c, 'leaves', 1.0),
    ('leafPale', 0x8a9a78, 'leaves', 1.0),
    # people: the white of a man's toga or tunic, the colours of women's dress, skin, black hair
    ('toga', 0xece7da, 'cloth', 1.0),
    ('dressSaffron', 0xc9a24c, 'cloth', 1.0),
    ('dressMadder', 0xa8604f, 'cloth', 1.0),
    ('dressSage', 0x8fa58c, 'cloth', 1.0),
    ('dressBlueGrey', 0x8f9fb0, 'cloth', 1.0),
    ('dressMauve', 0xa98496, 'cloth', 1.0),
    ('skin', 0xc99b7a, 'flat', 1.0),
    ('hair', 0x1c1815, 'flat', 1.0),
    ('window', 0x6b4f35, 'shutters', 1.0),
    ('windowOpen', 0x4a3a2a, 'shuttersHalfOpen', 1.0),
]


def channels_of(colour):
    return [(colour >> 16) & 255, (colour >> 8) & 255, colour & 255]


def shaded(channels, brightness, warmth=0.0):
    red, green, blue = channels
    values = [red * (brightness + warmth), green * brightness, blue * (brightness - warmth)]
    return tuple(max(0, min(255, int(round(value)))) for value in values)


def paint_tile(kind, colour, chance):
    size = TILE_SIZE_PIXELS
    base = channels_of(colour)
    pixels = [[shaded(base, 1.0) for _ in range(size)] for _ in range(size)]

    def speckle(amount):
        for row in range(size):
            for column in range(size):
                pixels[row][column] = shaded(list(pixels[row][column]), 1.0 + chance.uniform(-amount, amount))

    if kind == 'flat':
        pass
    elif kind == 'plain':
        speckle(0.025)
    elif kind == 'plaster':
        # soft patches of weather, a little lighter or darker, wrapped round the edges of the tile
        patches = [(chance.uniform(0, size), chance.uniform(0, size), chance.uniform(5, 11), chance.uniform(-0.035, 0.035)) for _ in range(7)]
        for row in range(size):
            for column in range(size):
                brightness = 1.0
                for patch_x, patch_y, radius, strength in patches:
                    distance_x = min(abs(column - patch_x), size - abs(column - patch_x))
                    distance_y = min(abs(row - patch_y), size - abs(row - patch_y))
                    distance = (distance_x ** 2 + distance_y ** 2) ** 0.5
                    if distance < radius:
                        brightness += strength * (1 - distance / radius)
                pixels[row][column] = shaded(base, brightness + chance.uniform(-0.012, 0.012))
    elif kind == 'ashlar':
        # two courses of blocks, the joints a shade darker, each block a touch different
        course_height = size // 2
        block_width = size // 2
        for course in range(2):
            offset = (block_width // 2) * (course % 2)
            block_brightness = [1.0 + chance.uniform(-0.02, 0.02) for _ in range(2)]
            for row in range(course * course_height, (course + 1) * course_height):
                for column in range(size):
                    along = (column + offset) % size
                    brightness = block_brightness[along // block_width]
                    if row % course_height == course_height - 1 or along % block_width == 0:
                        brightness -= 0.05
                    pixels[row][column] = shaded(base, brightness + chance.uniform(-0.008, 0.008))
    elif kind == 'bricks':
        # thin Roman bricks in courses with pale mortar, every brick its own shade
        course_height = 4
        brick_length = 12
        mortar = shaded(channels_of(0xd8cdb6), 1.0)
        for course in range(size // course_height):
            offset = (brick_length // 2) * (course % 2) + chance.randrange(0, 2)
            shades = {}
            for row in range(course * course_height, (course + 1) * course_height):
                for column in range(size):
                    along = (column + offset) % 36  # three bricks to a course, which wraps at the tile's edge
                    brick = along // brick_length
                    if brick not in shades:
                        shades[brick] = (1.0 + chance.uniform(-0.10, 0.08), chance.uniform(-0.03, 0.03))
                    if row % course_height == course_height - 1 or along % brick_length == 0:
                        pixels[row][column] = mortar
                    else:
                        pixels[row][column] = shaded(base, shades[brick][0], shades[brick][1])
    elif kind == 'roofTiles':
        # courses of pan tiles under round cover tiles: each course is lit at its lower edge and
        # shaded where the course above lies on it; every tile has its own shade of terracotta
        course_height = 8
        tile_width = 8
        for course in range(size // course_height):
            for tile in range(size // tile_width):
                tile_brightness = 1.0 + chance.uniform(-0.07, 0.07)
                tile_warmth = chance.uniform(-0.03, 0.03)
                for row_in_course in range(course_height):
                    for column_in_tile in range(tile_width):
                        brightness = tile_brightness + 0.05 * (row_in_course / (course_height - 1)) - 0.03
                        if row_in_course == 0:
                            brightness -= 0.13  # the shadow under the course above
                        if column_in_tile in (0, 1):
                            brightness += 0.07  # the round cover tile over the joint
                        if column_in_tile == 2:
                            brightness -= 0.06  # its shadow on the pan
                        pixels[course * course_height + row_in_course][tile * tile_width + column_in_tile] = shaded(base, brightness, tile_warmth)
    elif kind == 'grain':
        for column in range(size):
            streak = 1.0 + chance.uniform(-0.06, 0.06)
            for row in range(size):
                pixels[row][column] = shaded(base, streak + chance.uniform(-0.015, 0.015))
    elif kind == 'boards':
        board_width = 8
        for board in range(size // board_width):
            board_brightness = 1.0 + chance.uniform(-0.07, 0.07)
            for column in range(board * board_width, (board + 1) * board_width):
                for row in range(size):
                    gap = 0.22 if column % board_width == 0 else 0.0
                    pixels[row][column] = shaded(base, board_brightness - gap + chance.uniform(-0.015, 0.015))
    elif kind == 'thatch':
        for column in range(size):
            streak = 1.0 + chance.uniform(-0.10, 0.10)
            for row in range(size):
                layer = -0.10 if row % 8 == 0 else 0.0
                pixels[row][column] = shaded(base, streak + layer + chance.uniform(-0.03, 0.03), chance.uniform(-0.01, 0.01))
    elif kind == 'stripes':
        pale = channels_of(0xe3d7b8)
        for row in range(size):
            for column in range(size):
                is_pale = (column // 4) % 4 == 3
                pixels[row][column] = shaded(pale if is_pale else base, 1.0 + chance.uniform(-0.02, 0.02))
    elif kind in ('shutters', 'shuttersHalfOpen'):
        # one window as the Romans closed it: two leaves of wooden boards in a timber frame, a
        # batten across each leaf near its top and its bottom, the gap where the leaves meet.
        # Half open: the right leaf stands open, edge on, and the dark room shows behind it.
        frame = channels_of(0x5a4230)
        boards = channels_of(0x8a6a45)
        dark = channels_of(0x241f1b)
        board_width = 4
        board_shades = [1.0 + chance.uniform(-0.09, 0.09) for _ in range(size // board_width + 1)]
        for row in range(size):
            for column in range(size):
                on_frame = row < 2 or row >= size - 2 or column < 2 or column >= size - 2
                is_right_leaf = column >= size // 2
                if on_frame:
                    pixels[row][column] = shaded(frame, 1.0 + chance.uniform(-0.03, 0.03))
                elif kind == 'shuttersHalfOpen' and is_right_leaf:
                    # the open leaf seen edge on against the frame, the room behind
                    pixels[row][column] = shaded(boards, 0.8) if column >= size - 5 else shaded(dark, 1.0 + 0.3 * max(0.0, 1.0 - row / 12.0))
                elif column in (size // 2 - 1, size // 2):
                    pixels[row][column] = shaded(dark, 1.0)  # where the leaves meet
                else:
                    brightness = board_shades[column // board_width]
                    if column % board_width == 2:
                        brightness -= 0.14  # the joint between two boards
                    if row in (6, 7, 24, 25):
                        brightness -= 0.2   # a batten
                    pixels[row][column] = shaded(boards, brightness + chance.uniform(-0.02, 0.02))
    elif kind == 'cobbles':
        # small round stones in rows, each its own grey, the earth dark between them
        stone_size = 4
        for stone_row in range(size // stone_size):
            offset = (stone_size // 2) * (stone_row % 2)
            shades = [1.0 + chance.uniform(-0.13, 0.13) for _ in range(size // stone_size)]
            warmths = [chance.uniform(-0.02, 0.03) for _ in range(size // stone_size)]
            for row_in_stone in range(stone_size):
                for column in range(size):
                    along = (column + offset) % size
                    stone = along // stone_size
                    in_joint = row_in_stone == stone_size - 1 or along % stone_size == stone_size - 1
                    rounding = 0.05 if (row_in_stone == 0 or along % stone_size == 0) else 0.0
                    brightness = (0.68 if in_joint else shades[stone] + rounding)
                    pixels[stone_row * stone_size + row_in_stone][column] = shaded(base, brightness + chance.uniform(-0.02, 0.02), warmths[stone])
    elif kind == 'paving':
        # large dark slabs of basalt, fitted closely, each a little different
        slab_height = 8
        for slab_row in range(size // slab_height):
            joints = sorted(chance.sample(range(2, size - 2), 2))
            offset = chance.randrange(0, size)
            shades = [1.0 + chance.uniform(-0.1, 0.1) for _ in range(3)]
            for row_in_slab in range(slab_height):
                for column in range(size):
                    along = (column + offset) % size
                    slab = 0 if along < joints[0] else 1 if along < joints[1] else 2
                    in_joint = row_in_slab == slab_height - 1 or along in joints or along == 0
                    pixels[slab_row * slab_height + row_in_slab][column] = shaded(base, (0.7 if in_joint else shades[slab]) + chance.uniform(-0.02, 0.02))
    elif kind == 'roughStone':
        # courses of rough blocks of tufa of many lengths, worn and stained, with a brick here and there
        course_height = 4
        brick = channels_of(0xb07a55)
        for course in range(size // course_height):
            column = 0
            offset = chance.randrange(0, size)
            blocks = []
            while column < size:
                block_length = chance.choice([3, 4, 5, 6, 8])
                blocks.append((column, min(size, column + block_length), 1.0 + chance.uniform(-0.16, 0.12), chance.random() < 0.14))
                column += block_length
            for row_in_course in range(course_height):
                for block_start, block_end, brightness, is_brick in blocks:
                    for block_column in range(block_start, block_end):
                        in_joint = row_in_course == course_height - 1 or block_column == block_start
                        colour_of_block = brick if is_brick else base
                        value = shaded(colour_of_block, (0.74 if in_joint else brightness) + chance.uniform(-0.04, 0.04))
                        pixels[course * course_height + row_in_course][(block_column + offset) % size] = value
    elif kind == 'cloth':
        # a plain weave, uneven in its threads, weathered in soft bands, a seam now and then
        thread_rows = [1.0 + chance.uniform(-0.035, 0.035) for _ in range(size)]
        thread_columns = [1.0 + chance.uniform(-0.03, 0.03) for _ in range(size)]
        for row in range(size):
            for column in range(size):
                weathering = 0.03 * (((row // 8) % 2) * 2 - 1)
                seam = -0.09 if column == 0 else 0.0
                pixels[row][column] = shaded(base, thread_rows[row] * thread_columns[column] + weathering + seam + chance.uniform(-0.012, 0.012))
    elif kind == 'grass':
        # dry Mediterranean grass: tufts lighter and darker, a little earth showing
        earth = channels_of(0x9c8a66)
        for row in range(size):
            for column in range(size):
                if chance.random() < 0.07:
                    pixels[row][column] = shaded(earth, 1.0 + chance.uniform(-0.06, 0.06))
                else:
                    pixels[row][column] = shaded(base, 1.0 + chance.uniform(-0.12, 0.1), chance.uniform(-0.03, 0.03))
    elif kind == 'leaves':
        for row in range(size):
            for column in range(size):
                light = 0.1 if (row + column) % 5 == 0 else 0.0
                pixels[row][column] = shaded(base, 1.0 + light + chance.uniform(-0.14, 0.1))
    else:
        raise ValueError(kind)
    return pixels


def main():
    chance = random.Random(2026)
    folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'textures')
    os.makedirs(folder, exist_ok=True)
    picture = Image.new('RGB', (COLUMN_COUNT * TILE_SIZE_PIXELS, ROW_COUNT * TILE_SIZE_PIXELS), (128, 128, 128))
    layout = {'tileSizePixels': TILE_SIZE_PIXELS, 'tiles': {}}
    for index, (name, colour, kind, metres_per_repeat) in enumerate(MATERIALS):
        column = index % COLUMN_COUNT
        row = index // COLUMN_COUNT
        pixels = paint_tile(kind, colour, chance)
        for pixel_row in range(TILE_SIZE_PIXELS):
            for pixel_column in range(TILE_SIZE_PIXELS):
                picture.putpixel((column * TILE_SIZE_PIXELS + pixel_column, row * TILE_SIZE_PIXELS + pixel_row), pixels[pixel_row][pixel_column])
        layout['tiles'][name] = {'column': column, 'row': row, 'metresPerRepeat': metres_per_repeat}
    picture.save(os.path.join(folder, 'atlas.png'))
    with open(os.path.join(folder, 'atlas.json'), 'w', encoding='utf-8') as layout_file:
        json.dump(layout, layout_file, indent=2)
    print('atlas.png', picture.size, 'and atlas.json written to', os.path.normpath(folder))


main()
