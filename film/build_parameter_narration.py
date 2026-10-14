# Writes parameter_narration.json, the lines the parameter film and its voice are made from, out
# of the script (script_parameters_zh.md): a "## sNN title" heading opens a scene, every other
# non-empty line is one spoken sentence. The duration of a line is measured from its voice file
# (parameter_voice/<name>.mp3, made by the chinese-voice skill from this JSON) where that exists,
# else estimated from its length.
#   python build_parameter_narration.py
import json
import os
import re
import subprocess

FILM_FOLDER = os.path.dirname(os.path.abspath(__file__))
SCRIPT_FILE = os.path.join(FILM_FOLDER, 'script_parameters_zh.md')
NARRATION_FILE = os.path.join(FILM_FOLDER, 'parameter_narration.json')
VOICE_FOLDER = os.path.join(FILM_FOLDER, 'parameter_voice')
SECONDS_FOR_EACH_CHARACTER = 0.19  # at 1.25 times speed, an estimate until the voice is made

# spoken differently from the subtitle (the voice reads tts, the subtitle shows zh)
SPOKEN = {}


def duration_of(name, words):
    voice_file = os.path.join(VOICE_FOLDER, name + '.mp3')
    if os.path.exists(voice_file):
        probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', voice_file],
                               capture_output=True, text=True)
        return round(float(probe.stdout.strip()), 2)
    return round(len(words) * SECONDS_FOR_EACH_CHARACTER, 2)


def main():
    lines = []
    scene_name = None
    scene_title = None
    line_number = 0
    with open(SCRIPT_FILE, encoding='utf-8') as script:
        for raw in script:
            row = raw.strip()
            if not row or row.startswith('<!--'):
                continue
            heading = re.match(r'^##\s+(s\d\d)\s+(.*)$', row)
            if heading:
                scene_name, scene_title = heading.group(1), heading.group(2).strip()
                line_number = 0
                continue
            if row.startswith('#') or scene_name is None:
                continue
            line_number += 1
            name = '%s_%02d' % (scene_name, line_number)
            entry = {'name': name, 'scene': scene_title, 'text': SPOKEN.get(name, row), 'zh': row}
            if name in SPOKEN:
                entry['tts'] = SPOKEN[name]
            entry['duration'] = duration_of(name, entry['text'])
            lines.append(entry)
    with open(NARRATION_FILE, 'w', encoding='utf-8') as out:
        json.dump(lines, out, ensure_ascii=False, indent=1)
    measured = sum(1 for line in lines if os.path.exists(os.path.join(VOICE_FOLDER, line['name'] + '.mp3')))
    print('%d lines in %d scenes; %d durations measured from the voice, %d estimated; %.0f s of speech' % (
        len(lines), len(set(line['scene'] for line in lines)), measured, len(lines) - measured, sum(line['duration'] for line in lines)))


if __name__ == '__main__':
    main()
