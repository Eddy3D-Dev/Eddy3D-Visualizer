
const fs = require('fs');
const path = require('path');

const csvPath = path.resolve('./Dataset/ML_BasicC_result_0.csv');
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');
const header = lines[0].split(',');
const hIdx = header.findIndex(h => h.trim() === 'Bldg_height');

for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length > hIdx) {
        const val = parseFloat(parts[hIdx]);
        // Look for a point with height ~11 or 12 (the "short" ones I saw)
        if (val > 10 && val < 13) {
            console.log('Found short building point (h=' + val + '):');
            header.forEach((h, idx) => {
                console.log(`${h}: ${parts[idx]}`);
            });
            break;
        }
    }
}
