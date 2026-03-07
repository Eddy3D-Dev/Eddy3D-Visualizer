const { performance } = require('perf_hooks');

const numPoints = 200000;
const activeSensorData = [];
for (let i = 0; i < numPoints; i++) {
  activeSensorData.push({ x: Math.random() * 100, y: Math.random() * 100, z: Math.random() * 100, val: Math.random(), h: 0 });
}

const instanceMatrixArray = new Float32Array(numPoints * 16);
instanceMatrixArray.fill(0);

// setup
for (let i = 0; i < numPoints; i += 1) {
  const point = activeSensorData[i];
  const mOff = i * 16;
  instanceMatrixArray[mOff + 0] = 1;
  instanceMatrixArray[mOff + 5] = 1;
  instanceMatrixArray[mOff + 10] = 1;
  instanceMatrixArray[mOff + 15] = 1;
  instanceMatrixArray[mOff + 12] = point.x;
  instanceMatrixArray[mOff + 13] = point.y;
  instanceMatrixArray[mOff + 14] = point.z;
}

const worldSize = 2.5;

function oldUpdate() {
  instanceMatrixArray.fill(0);
  for (let i = 0; i < activeSensorData.length; i += 1) {
    const point = activeSensorData[i];
    const mOff = i * 16;
    instanceMatrixArray[mOff + 0] = worldSize;
    instanceMatrixArray[mOff + 5] = worldSize;
    instanceMatrixArray[mOff + 10] = 1;
    instanceMatrixArray[mOff + 15] = 1;
    instanceMatrixArray[mOff + 12] = point.x;
    instanceMatrixArray[mOff + 13] = point.y;
    instanceMatrixArray[mOff + 14] = point.z;
  }
}

function newUpdate() {
  const len = activeSensorData.length;
  for (let i = 0; i < len; i += 1) {
    const mOff = i * 16;
    instanceMatrixArray[mOff + 0] = worldSize;
    instanceMatrixArray[mOff + 5] = worldSize;
  }
}

for (let i = 0; i < 50; i++) { oldUpdate(); newUpdate(); }

let start = performance.now();
for (let i = 0; i < 100; i++) oldUpdate();
console.log('Old Update: ' + (performance.now() - start).toFixed(2) + ' ms');

start = performance.now();
for (let i = 0; i < 100; i++) newUpdate();
console.log('New Update: ' + (performance.now() - start).toFixed(2) + ' ms');
