const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const target = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(target) : [target];
    });
}

const srcDir = path.resolve(__dirname, '..', 'src');
const files = walk(srcDir).filter(file => file.endsWith('.js'));
let failed = false;

for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
console.log(`Sintaxe valida em ${files.length} arquivos JavaScript.`);
