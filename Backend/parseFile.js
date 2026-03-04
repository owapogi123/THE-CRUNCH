const fs=require('fs');
const parser=require('@babel/parser');
const path=process.argv[2];
if(!path){console.error('usage: node parseFile.js <path>');process.exit(1);}
const code=fs.readFileSync(path,'utf8');
try{
 parser.parse(code,{sourceType:'module',plugins:['jsx','typescript']});
 console.log(path,'parsed successfully');
}catch(e){
 console.error('error parsing',path,e.message);
 if(e.loc){
   console.error('at',e.loc);
 }
}
