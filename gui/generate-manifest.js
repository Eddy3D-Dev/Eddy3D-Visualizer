import fs from 'fs';
import path from 'path';

const meshDir = path.resolve('../mesh');
const datasetDir = path.resolve('../Dataset');
const publicMeshDir = path.resolve('./public/mesh');
const publicDatasetDir = path.resolve('./public/Dataset');

// Create public directories if they don't exist
[publicMeshDir, publicDatasetDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

function getFiles(dir, extension, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            getFiles(filePath, extension, fileList);
        } else if (path.extname(file).toLowerCase() === extension) {
            fileList.push(filePath);
        }
    });
    return fileList;
}

const stlFiles = getFiles(meshDir, '.stl');
const stlManifest = stlFiles.map(file => {
    const relativePath = path.relative(meshDir, file);
    const destPath = path.join(publicMeshDir, relativePath);
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(file, destPath);
    return {
        name: path.basename(file),
        path: `mesh/${relativePath.replace(/\\/g, '/')}`,
        type: 'stl'
    };
});

const csvFiles = getFiles(datasetDir, '.csv');
const csvManifest = csvFiles.map(file => {
    const relativePath = path.relative(datasetDir, file);
    const destPath = path.join(publicDatasetDir, relativePath);
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(file, destPath);
    return {
        name: path.basename(file),
        path: `Dataset/${relativePath.replace(/\\/g, '/')}`,
        type: 'csv'
    };
});

const manifest = [...stlManifest, ...csvManifest];
fs.writeFileSync('./public/manifest.json', JSON.stringify(manifest, null, 2));
console.log(`Manifest generated with ${manifest.length} files (${stlManifest.length} STLs, ${csvManifest.length} CSVs).`);
