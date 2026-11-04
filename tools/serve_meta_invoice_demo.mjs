import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createExtractor,ExtractionError} from '../backend/meta-invoice/extractor.mjs';

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.mp4':'video/mp4','.txt':'text/plain; charset=utf-8'};
export function createDemoServer({publicDir,extractor=createExtractor()}={}){
  const base=fs.realpathSync(publicDir);
  const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  return http.createServer(async(req,res)=>{
    const host=req.headers.host,port=req.socket.localPort;
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))return reply(res,403,{error:'host_not_allowed'});
    const origin='http://'+host;
    if(req.headers.origin&&req.headers.origin!==origin)return reply(res,403,{error:'origin_not_allowed'});
    let url;try{url=new URL(req.url,origin);}catch{return reply(res,400,{error:'bad_request'});}
    if(url.pathname==='/api/invoice-draft/status'&&req.method==='GET')return reply(res,200,extractor.status());
    if(url.pathname==='/api/invoice-draft'){
      if(req.method!=='POST')return reply(res,405,{error:'method_not_allowed'});
      if(req.headers['x-monkee-request']!=='invoice-draft-v1'||req.headers['content-type']!=='application/json')return reply(res,400,{error:'json_request_required'});
      let size=0;const parts=[];
      try{
        for await(const part of req){size+=part.length;if(size>65536){reply(res,413,{error:'notes_too_large'});return;}parts.push(part);}
        const data=JSON.parse(Buffer.concat(parts).toString('utf8'));
        if(!data||Object.keys(data).sort().join(',')!=='consent,notes')return reply(res,400,{error:'unexpected_fields'});
        const result=await extractor.extract(data);return reply(res,200,result);
      }catch(e){return reply(res,e instanceof ExtractionError?e.status:400,{error:e instanceof ExtractionError?e.code:'invalid_request'});}
    }
    if(req.method!=='GET')return reply(res,405,{error:'method_not_allowed'});
    try{
      const file=path.resolve(base,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
      if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()||!fs.realpathSync(file).startsWith(base+path.sep))return reply(res,404,{error:'not_found'});
      res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});fs.createReadStream(file).pipe(res);
    }catch{return reply(res,404,{error:'not_found'});}
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const packaged=path.join(root,'public');
  const publicDir=fs.existsSync(path.join(packaged,'index.html'))?packaged:fs.readFileSync(path.join(root,'reports/meta-demo-path.txt'),'utf8').trim();
  if(publicDir!==packaged&&(!publicDir.startsWith(path.join(root,'reports')+path.sep)||path.basename(publicDir)!=='public'))throw new Error('Build the isolated demo first.');
  const extractor=createExtractor({apiKey:process.env.MODEL_API_KEY||'',approved:process.env.META_INVOICE_LIVE_APPROVED==='1',maxRequests:3});
  const port=Number(process.env.META_INVOICE_PORT||8767);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Use a local port from 1024 to 65535.');
  createDemoServer({publicDir,extractor}).listen(port,'127.0.0.1',()=>console.log('MonkeeTools invoice demo: http://127.0.0.1:'+port+'/; live configured: '+extractor.status().configured+'; maximum 3 attempts; no automatic retries.'));
}
