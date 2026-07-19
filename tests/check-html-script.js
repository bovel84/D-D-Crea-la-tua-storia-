'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(source => source.trim());

if (!scripts.length) throw new Error('Nessuno script inline trovato in index.html.');
scripts.forEach(source => new Function(source)); // eslint-disable-line no-new-func
console.log(`✓ Sintassi di ${scripts.length} script inline valida`);
