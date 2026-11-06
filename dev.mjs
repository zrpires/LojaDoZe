import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const routes = new Set(['chat','health','catalog','checkout','order']);
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')){
      const name=url.pathname.slice(5);
      if(!routes.has(name)) {res.writeHead(404);return res.end('Not found');}
      try { const {default:handler}=await import(`./api/${name}.js`);return await handler(req,res); }
      catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;res.writeHead(404);return res.end('Not found');}
    }
    const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(!['index.html','app.js','style.css'].includes(name)){res.writeHead(404);return res.end('Not found');}
    const data=await readFile(fileURLToPath(new URL('./public/'+name,import.meta.url)));
    res.writeHead(200,{'Content-Type':{'html':'text/html; charset=utf-8','js':'text/javascript; charset=utf-8','css':'text/css; charset=utf-8'}[name.split('.').pop()]});res.end(data);
  }catch{res.writeHead(500);res.end('Erro interno');}
});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(`Abra http://localhost:${process.env.PORT||3000}`));
