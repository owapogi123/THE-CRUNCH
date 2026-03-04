const fetch = require('node-fetch').default;
(async()=>{
  try{
    const res = await fetch('http://localhost:5000/api/orders',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({items:[{product_id:1,qty:1,subtotal:12.34}],total:12.34,orderType:'dine-in'})
    });
    console.log('status',res.status);
    const txt = await res.text();
    console.log('body',txt);
  }catch(e){console.error(e);}  
})();