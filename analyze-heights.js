
const fs = require('fs');
const path = require('path');

const csvPath = path.resolve('./Dataset/ML_BasicC_result_0.csv');
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');
const header = lines[0].split(',');
const xIdx = header.findIndex(h => h.toLowerCase() === 'x');
const yIdx = header.findIndex(h => h.toLowerCase() === 'y');
const hIdx = header.findIndex(h => h.trim() === 'Bldg_height');

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
const data = new Map();

for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length > hIdx) {
        const x = parseFloat(parts[xIdx]);
        const y = parseFloat(parts[yIdx]);
        const h = parseFloat(parts[hIdx]);

        if (!isNaN(x) && !isNaN(y) && !isNaN(h)) {
            if (h > 0) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
                data.set(`${x},${y}`, h);
            }
        }
    }
}

// Grid Step (assuming 2 based on previous output 39, 41, 43...)
const step = 2;
const rows = [];

console.log(`Bounds: X[${minX}, ${maxX}], Y[${minY}, ${maxY}]`);

for (let y = maxY; y >= minY; y -= step) {
    let row = '';
    for (let x = minX; x <= maxX; x += step) {
        const h = data.get(`${x},${y}`);
        if (h === undefined) {
            row += ' .. ';
        } else {
            // Format height as 2 digits
            const s = Math.round(h).toString();
            row += s.padStart(3, ' ');
        }
    }
    rows.push(row);
}

console.log(rows.join('\n'));
