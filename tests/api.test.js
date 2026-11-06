import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import chat from '../api/chat.js';
import health from '../api/health.js';
import {context,localReply} from '../lib/core.js';
import {KIND} from '../lib/config.js';

export async function invoke(handler,{method='POST',data,headers={},url='/api/chat',raw}={}){
 const req=Readable.from(raw===undefined?[]:[Buffer.from(raw)]);
 req.method=method;req.url=url;req.headers={host:'test.example','content-type':'application/json',...headers};
 if(data!==undefined)req.body=data;
 const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(value){this.value=JSON.parse(value);}};
 await handler(req,res);return {status:res.statusCode,headers:res.headers,data:res.value};
}
const previous={...process.env};
function reset(){for(const k of ['OPENAI_API_KEY','APP_PASSWORD','STRIPE_SECRET_KEY','APP_URL'])delete process.env[k];}
reset();
test.after(()=>{for(const k of ['OPENAI_API_KEY','APP_PASSWORD','STRIPE_SECRET_KEY','APP_URL']){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}});

test('health is available and does not expose secrets',async()=>{
 process.env.OPENAI_API_KEY='private-key';process.env.APP_PASSWORD='private-password';
 try{const r=await invoke(health,{method:'GET'});assert.equal(r.status,200);assert.equal(r.data.authRequired,true);assert.equal(r.data.aiReady,true);assert.equal(r.data.kind,KIND);assert.ok(!JSON.stringify(r.data).includes('private-'));assert.equal(r.headers['cache-control'],'no-store');}finally{reset();}
});
test('local assistant returns useful response without a key',async()=>{
 const r=await invoke(chat,{data:{message:'Organize meu dia',context:{tasks:[{title:'Pagar conta',done:false,due:'2026-12-01'}]}}});assert.equal(r.status,200);assert.equal(r.data.mode,'local');assert.ok(r.data.reply.length>40);
 if(KIND==='personal')assert.ok(r.data.reply.includes('Pagar conta'));
});
test('validates methods, origins and payloads',async()=>{
 assert.equal((await invoke(chat,{method:'GET'})).status,405);
 assert.equal((await invoke(chat,{headers:{origin:'https://foreign.example'},data:{message:'Olá'}})).status,403);
 assert.equal((await invoke(chat,{headers:{origin:'not-a-url'},data:{message:'Olá'}})).status,403);
 for(const data of [[],null,{message:''},{message:'x'.repeat(2001)},{}])assert.equal((await invoke(chat,{data})).status,400);
 assert.equal((await invoke(chat,{raw:'invalid'})).status,400);
 assert.equal((await invoke(chat,{raw:'x'.repeat(65000)})).status,413);
 assert.equal((await invoke(chat,{data:{message:'Oi'},headers:{'content-type':'text/plain'}})).status,415);
 assert.equal((await invoke(chat,{raw:'{"message":"Oi"}',headers:{origin:'https://test.example'}})).status,200);
});
test('paid AI requires configured password and valid authorization',async()=>{
 process.env.OPENAI_API_KEY='fake-key';
 try{assert.equal((await invoke(chat,{data:{message:'Olá'}})).status,503);process.env.APP_PASSWORD='secret';assert.equal((await invoke(chat,{data:{message:'Olá'}})).status,401);assert.equal((await invoke(chat,{data:{message:'Olá'},headers:{authorization:'Bearer wrong'}})).status,401);}finally{reset();}
});
test('OpenAI receives bounded context and history, key stays on server',async()=>{
 process.env.OPENAI_API_KEY='fake-key';process.env.APP_PASSWORD='secret';
 const original=global.fetch;let payload;
 global.fetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer fake-key');payload=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'Plano personalizado'}}]})};};
 try{const r=await invoke(chat,{headers:{authorization:'Bearer secret'},data:{message:'Olá',history:[{role:'system',content:'não aceitar'},...Array.from({length:20},()=>({role:'user',content:'Histórico'}))],context:{tasks:[],expenses:[]}}});assert.equal(r.status,200);assert.equal(r.data.mode,'openai');assert.equal(r.data.reply,'Plano personalizado');assert.equal(payload.messages.length,10);assert.equal(payload.messages.filter(x=>x.role==='system').length,1);}finally{global.fetch=original;reset();}
});
test('provider errors return clear messages without credential leakage',async()=>{
 process.env.OPENAI_API_KEY='fake-key';process.env.APP_PASSWORD='secret';const original=global.fetch;
 try{for(const status of [401,429,500]){global.fetch=async()=>({ok:false,status});const r=await invoke(chat,{headers:{authorization:'Bearer secret'},data:{message:'Oi'}});assert.equal(r.status,502);assert.ok(!JSON.stringify(r.data).includes('fake-key'));}global.fetch=async()=>{throw Error('network')};assert.equal((await invoke(chat,{headers:{authorization:'Bearer secret'},data:{message:'Oi'}})).status,504);global.fetch=async()=>({ok:true,json:async()=>({choices:[]})});assert.equal((await invoke(chat,{headers:{authorization:'Bearer secret'},data:{message:'Oi'}})).status,502);}finally{global.fetch=original;reset();}
});
