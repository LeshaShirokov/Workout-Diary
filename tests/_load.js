// Загружает модули приложения в Node (они пишут в globalThis.WD).
const path = require('path');
const R = path.join(__dirname, '..', 'js');
['core', 'model', 'seed', 'storage', 'io'].forEach(m => require(path.join(R, m + '.js')));
module.exports = globalThis.WD;
