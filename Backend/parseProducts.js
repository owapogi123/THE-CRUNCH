const fs = require('fs');
const parser = require('@babel/parser');
const code = fs.readFileSync('c:/Users/Jhon Carl Balderamos/Documents/CODES/POS-system/THE-CRUNCH/src/pages/products.tsx','utf8');
try {
  parser.parse(code, { sourceType: 'module', plugins: ['jsx','typescript'] });
  console.log('parsed successfully');
} catch (e) {
  console.error(e.message);
  if (e.loc) console.error('loc', e.loc);
}
