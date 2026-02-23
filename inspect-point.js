
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const csvPath = path.resolve('./Dataset/ML_BasicC_result_0.csv');

async function findPoint() {
    const fileStream = fs.createReadStream(csvPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let header = null;
    let hIdx = -1;

    for await (const line of rl) {
        if (!header) {
            header = line.split(',');
            hIdx = header.findIndex(h => h.trim() === 'Bldg_height');
            continue;
        }

        const parts = line.split(',');
        if (parts.length > hIdx) {
            const val = parseFloat(parts[hIdx]);
            // Look for a point with height ~11 or 12 (the "short" ones I saw)
            if (val > 10 && val < 13) {
                console.log('Found short building point (h=' + val + '):');
                header.forEach((h, idx) => {
                    console.log(`${h}: ${parts[idx]}`);
                });
                rl.close();
                fileStream.destroy();
                return;
            }
        }
    }
}

findPoint().catch(err => {
    console.error(err);
});
