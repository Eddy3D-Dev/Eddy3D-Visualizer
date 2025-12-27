
const fs = require('fs');
const path = require('path');

const csvPath = path.resolve('./Dataset/ML_BasicC_result_45.csv');
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');
const header = lines[0].split(',');
const hIdx = header.findIndex(h => h.trim() === 'Bldg_height');

let count = 0;
let maxH = 0;

for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length > hIdx) {
        const val = parseFloat(parts[hIdx]);
        if (val > 0) {
            count++;
            maxH = Math.max(maxH, val);
        }
    }
}

console.log(`Checking result_45.csv: Found ${count} non-zero heights. Max: ${maxH}`);
