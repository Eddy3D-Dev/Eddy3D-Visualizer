const { performance } = require('perf_hooks');

const data = [];
for (let i = 0; i < 500000; i++) {
  data.push({ x: i, y: i, z: 0, val: Math.random(), h: Math.random() > 0.8 ? 10 : 0 });
}

function testForEach() {
  let minVal = Infinity;
  let maxVal = -Infinity;
  const start = performance.now();
  data.forEach(d => {
    if (d.val < minVal) minVal = d.val;
    if (d.val > maxVal) maxVal = d.val;
  });
  return performance.now() - start;
}

function testForLoop() {
  let minVal = Infinity;
  let maxVal = -Infinity;
  const start = performance.now();
  const len = data.length;
  for (let i = 0; i < len; i++) {
    const v = data[i].val;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }
  return performance.now() - start;
}

function testFilter() {
  const start = performance.now();
  const validBuildings = data.filter(d => d.h > 0);
  return performance.now() - start;
}

function testForPush() {
  const start = performance.now();
  const validBuildings = [];
  const len = data.length;
  for (let i = 0; i < len; i++) {
    if (data[i].h > 0) validBuildings.push(data[i]);
  }
  return performance.now() - start;
}

console.log("forEach:", testForEach().toFixed(2), "ms");
console.log("for loop:", testForLoop().toFixed(2), "ms");
console.log("filter:", testFilter().toFixed(2), "ms");
console.log("for push:", testForPush().toFixed(2), "ms");
