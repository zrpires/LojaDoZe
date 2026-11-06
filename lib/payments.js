import {createHash} from 'node:crypto';
import {PRODUCTS} from './config.js';
import {body,HttpError,text} from './core.js';
export function cartItems(value){
 if(!Array.isArray(value)||value.length<1||value.length>PRODUCTS.length)throw new HttpError(400,'Carrinho inválido.');
 const seen=new Set();return value.map(item=>{
  if(!item||typeof item.id!=='string'||seen.has(item.id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>20)throw new HttpError(400,'Produto ou quantidade inválida.');
  const product=PRODUCTS.find(p=>p.id===item.id);if(!product)throw new HttpError(400,'Produto não encontrado.');seen.add(item.id);return {product,quantity:item.quantity};
 });
}
export async function stripe(path,options={}){
 let response;try{response=await fetch('https://api.stripe.com/v1/'+path,{...options,signal:AbortSignal.timeout(25000),headers:{Authorization:'Bearer '+process.env.STRIPE_SECRET_KEY,...options.headers}});}catch{throw new HttpError(504,'O pagamento demorou para responder. Tente novamente com o mesmo carrinho.');}
 if(!response.ok)throw new HttpError(502,'Não foi possível consultar o pagamento. Confira a configuração Stripe ou tente novamente.');return response.json();
}
export function appUrl(){let url;try{url=new URL(process.env.APP_URL);}catch{throw new HttpError(503,'Configure APP_URL com o endereço definitivo da loja na Vercel.');}if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new HttpError(503,'APP_URL precisa ser um endereço HTTPS, sem caminho ou parâmetros.');return url.origin;}
export async function checkout(req){
 const data=await body(req),items=cartItems(data.items),total=items.reduce((sum,i)=>sum+i.quantity*i.product.price,0);
 if(!process.env.STRIPE_SECRET_KEY)return {mode:'demo',total,paid:false};
 const url=appUrl(),requestId=text(data.requestId,80);if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId))throw new HttpError(400,'Identificador de checkout inválido.');
 const form=new URLSearchParams({mode:'payment',success_url:url+'/?checkout=success&session_id={CHECKOUT_SESSION_ID}',cancel_url:url+'/?checkout=cancel',billing_address_collection:'auto','shipping_address_collection[allowed_countries][0]':'BR','customer_creation':'always','submit_type':'pay','locale':'pt-BR'});
 for(const [index,item] of items.entries()){
  const key=`line_items[${index}]`;form.set(`${key}[price_data][currency]`,'brl');form.set(`${key}[price_data][unit_amount]`,String(item.product.price));form.set(`${key}[price_data][product_data][name]`,item.product.name);form.set(`${key}[quantity]`,String(item.quantity));
 }
 const fingerprint=createHash('sha256').update(requestId+JSON.stringify(items.map(i=>({id:i.product.id,quantity:i.quantity,price:i.product.price})))).digest('hex');
 const result=await stripe('checkout/sessions',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':'lojadoze-'+fingerprint},body:form.toString()});
 let redirect;try{redirect=new URL(result.url);}catch{throw new HttpError(502,'O provedor não retornou um checkout válido.');}
 if(redirect.protocol!=='https:'||redirect.hostname!=='checkout.stripe.com')throw new HttpError(502,'O provedor retornou uma URL inesperada.');
 return {mode:'stripe',url:result.url};
}
export async function order(req){
 if(!process.env.STRIPE_SECRET_KEY)throw new HttpError(503,'Pagamentos não configurados.');
 const url=new URL(req.url,'https://example.invalid'),id=url.searchParams.get('session_id');
 if(!id||!/^cs_(?:test_|live_)?[A-Za-z0-9]{10,200}$/.test(id))throw new HttpError(400,'Sessão inválida.');
 const session=await stripe('checkout/sessions/'+encodeURIComponent(id));
 if(session.currency!=='brl'||!Number.isSafeInteger(session.amount_total))throw new HttpError(502,'Dados de pagamento inválidos.');
 return {id:session.id,paid:session.payment_status==='paid'&&session.status==='complete',total:session.amount_total};
}
