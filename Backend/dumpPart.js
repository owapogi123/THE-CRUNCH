const fs = require('fs');
const path = 'c:/Users/Jhon Carl Balderamos/Documents/CODES/POS-system/THE-CRUNCH/src/pages/products.tsx';
const lines = fs.readFileSync(path,'utf8').split(/\r?\n/);
const start = 270;
const end = 310;
for(let i=start;i<end && i<lines.length;i++){
  console.log((i+1)+': '+lines[i]);
}
