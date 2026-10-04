// dump getModelSpec for every model id (physics dims check: node dev/car4_spec.mjs > file.json; diff before/after)
import { getModelSpec, MODEL_IDS, _archCheck } from '../src/vehicle/models.js';
const out = {};
for (const id of MODEL_IDS) { const s = getModelSpec(id); out[id] = JSON.parse(JSON.stringify(s)); }
if (process.argv.includes('--arch')) { for (const id of MODEL_IDS) console.error(id, JSON.stringify(_archCheck(id))); }
console.log(JSON.stringify(out));
