// Purpose: settings of the development server, and the save slots it keeps.
// The page is not reloaded when a file changes: it changes only when it is refreshed in the
// browser (F5), so that work on the code does not interrupt looking at the running page.
// The folders of results (films, test pictures, saved runs, archives, the slots) are not watched:
// they hold thousands of big files that the code never imports, and a file locked by another
// program there (2026-10-11: film/devlog/sample_beauty.jpg, EBUSY) crashed the watcher and the
// server with it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The save slots (the author, 2026-10-13): so many slots on the server side, each holding a town
// with its settlement, the parameters of the panel and a thumbnail, in the folder saves/:
//   saves/slot_<n>.json       { run, settings }   (the run as Save town writes it)
//   saves/slot_<n>.jpg        the thumbnail
//   saves/slot_<n>.meta.json  { slot, label, savedAt, day, households, ground, seed }  (the list reads these only)
// The page talks to them at /saves/slots (GET: the list) and /saves/slot/<n> (GET: the slot,
// PUT: { run, settings, thumbnail (a data URL), label }, DELETE: emptied); the thumbnails are
// served as files (saves/slot_<n>.jpg).
const SLOT_COUNT = 8;
const SAVES_FOLDER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'saves');

function slotPaths(slotNumber) {
  const base = path.join(SAVES_FOLDER, 'slot_' + slotNumber);
  return { save: base + '.json', thumbnail: base + '.jpg', meta: base + '.meta.json' };
}

function listTheSlots() {
  const slots = [];
  for (let slotNumber = 1; slotNumber <= SLOT_COUNT; slotNumber++) {
    const paths = slotPaths(slotNumber);
    let meta = null;
    if (fs.existsSync(paths.meta)) {
      try {
        meta = JSON.parse(fs.readFileSync(paths.meta, 'utf8'));
      } catch (error) {
        meta = null;
      }
    }
    slots.push({ slot: slotNumber, meta: meta, hasThumbnail: fs.existsSync(paths.thumbnail) });
  }
  return slots;
}

function writeTheSlot(slotNumber, body) {
  fs.mkdirSync(SAVES_FOLDER, { recursive: true });
  const paths = slotPaths(slotNumber);
  fs.writeFileSync(paths.save, JSON.stringify({ run: body.run, settings: body.settings }));
  const thumbnail = String(body.thumbnail || '');
  const commaAt = thumbnail.indexOf(',');
  if (thumbnail.indexOf('data:image/jpeg;base64,') === 0 && commaAt > 0) {
    fs.writeFileSync(paths.thumbnail, Buffer.from(thumbnail.slice(commaAt + 1), 'base64'));
  }
  const statistics = (body.run && body.run.statistics) || {};
  const meta = {
    slot: slotNumber, label: String(body.label || ''), savedAt: new Date().toISOString(),
    day: statistics.days || 0, households: statistics.households || 0, ground: body.run ? body.run.ground : null, seed: body.run ? body.run.seed : null,
  };
  fs.writeFileSync(paths.meta, JSON.stringify(meta));
  return meta;
}

function emptyTheSlot(slotNumber) {
  const paths = slotPaths(slotNumber);
  [paths.save, paths.thumbnail, paths.meta].forEach(function (file) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });
}

const saveSlotsPlugin = {
  name: 'rome-save-slots',
  configureServer(server) {
    server.middlewares.use('/saves', function (request, response, next) {
      const address = (request.url || '').split('?')[0];
      response.setHeader('Content-Type', 'application/json');
      function answer(status, body) {
        response.statusCode = status;
        response.end(JSON.stringify(body));
      }
      if (address === '/slots' && request.method === 'GET') {
        answer(200, { slotCount: SLOT_COUNT, slots: listTheSlots() });
        return;
      }
      const slotMatch = address.match(/^\/slot\/(\d+)$/);
      if (slotMatch === null) {
        next(); // (the thumbnails are files in saves/, served as such)
        return;
      }
      const slotNumber = Number(slotMatch[1]);
      if (slotNumber < 1 || slotNumber > SLOT_COUNT) {
        answer(404, { error: 'no slot ' + slotNumber });
        return;
      }
      const paths = slotPaths(slotNumber);
      if (request.method === 'GET') {
        if (!fs.existsSync(paths.save)) {
          answer(404, { error: 'slot ' + slotNumber + ' is empty' });
          return;
        }
        response.statusCode = 200;
        fs.createReadStream(paths.save).pipe(response);
        return;
      }
      if (request.method === 'DELETE') {
        emptyTheSlot(slotNumber);
        answer(200, { slot: slotNumber, emptied: true });
        return;
      }
      if (request.method === 'PUT' || request.method === 'POST') {
        const bodyChunks = [];
        request.on('data', function (chunk) { bodyChunks.push(chunk); });
        request.on('end', function () {
          try {
            answer(200, writeTheSlot(slotNumber, JSON.parse(Buffer.concat(bodyChunks).toString('utf8'))));
          } catch (error) {
            answer(500, { error: String(error) });
          }
        });
        return;
      }
      answer(405, { error: 'method ' + request.method });
    });
  },
};

export default {
  plugins: [saveSlotsPlugin],
  server: {
    hmr: false,
    watch: {
      ignored: ['**/film/**', '**/tools/tests/**', '**/tools/runs/**', '**/archive/**', '**/dist/**', '**/saves/**'],
    },
  },
};
