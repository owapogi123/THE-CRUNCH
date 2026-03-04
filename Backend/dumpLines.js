const fs = require('fs');
const path = 'c:/Users/Jhon Carl Balderamos/Documents/CODES/POS-system/THE-CRUNCH/src/pages/products.tsx';
const lines = fs.readFileSync(path,'utf8').split(/\r?\n/);
const start = Math.max(0, lines.length-20);
for (let i=start; i<lines.length; i++) {
  console.log((i+1)+':'+lines[i]);
}
