const { performance } = require('perf_hooks');

const data = [];
for (let i = 0; i < 500000; i++) {
  data.push({ x: i, y: i, z: 0, val: Math.random(), h: Math.random() > 0.8 ? 10 : 0 });
}

function testMapGetSet() {
  const map = new Map();
  const start = performance.now();
  for (let i = 0; i < data.length; i++) {
     let xMap = map.get(data[i].x);
     if (!xMap) {
       xMap = new Map();
       map.set(data[i].x, xMap);
     }
     xMap.set(data[i].y, data[i].h);
  }
  return performance.now() - start;
}

function testForEach() {
  const map = new Map();
  const start = performance.now();
  data.forEach(d => {
     let xMap = map.get(d.x);
     if (!xMap) {
       xMap = new Map();
       map.set(d.x, xMap);
     }
     xMap.set(d.y, d.h);
  });
  return performance.now() - start;
}

console.log("Map with for loop:", testMapGetSet().toFixed(2), "ms");
console.log("Map with forEach:", testForEach().toFixed(2), "ms");
