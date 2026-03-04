const fs=require('fs');
const parser=require('@babel/parser');
const code=fs.readFileSync('c:/Users/Jhon Carl Balderamos/Documents/CODES/POS-system/THE-CRUNCH/src/pages/products.tsx','utf8');
try{
 parser.parse(code,{sourceType:'module',plugins:['jsx','typescript']});
 console.log('parsed successfully');
}catch(e){
 console.error('err',e.message);
 if(e.loc){
   const lines=code.split(/\r?\n/);
   const {line,column}=e.loc;
   console.error('at',line,column);
   const start=Math.max(0,line-4);
   const end=Math.min(lines.length,line+4);
   console.error(lines.slice(start,end).map((l,i)=>(start+i+1)+': '+l).join('\n'));
 }
}
