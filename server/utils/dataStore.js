const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function readJson(filename, fallback = []) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function nextId(items) {
  if (!items.length) return 1;
  return Math.max(...items.map((i) => Number(i.id) || 0)) + 1;
}

function appendJson(filename, item) {
  const items = readJson(filename);
  items.push(item);
  writeJson(filename, items);
  return item;
}

function updateJson(filename, id, updates) {
  const items = readJson(filename);
  const index = items.findIndex((i) => String(i.id) === String(id));
  if (index === -1) return null;
  items[index] = { ...items[index], ...updates, updatedAt: new Date().toISOString() };
  writeJson(filename, items);
  return items[index];
}

function deleteJson(filename, id) {
  const items = readJson(filename);
  const filtered = items.filter((i) => String(i.id) !== String(id));
  if (filtered.length === items.length) return false;
  writeJson(filename, filtered);
  return true;
}

function findById(filename, id) {
  return readJson(filename).find((i) => String(i.id) === String(id)) || null;
}

module.exports = { readJson, writeJson, nextId, appendJson, updateJson, deleteJson, findById, DATA_DIR };
