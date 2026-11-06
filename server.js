'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json'};
const windows = new Map();
function json(res, status, data) { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}); res.end(JSON.stringify(data)); }
function rateLimit(req, bucket='default', max=24) {
  const key = bucket + ':' + (req.socket.remoteAddress || 'unknown'), now = Date.now();
  const hits = (windows.get(key) || []).filter(t => now - t < 600000);
  hits.push(now); windows.set(key, hits);
  return hits.length > max;
}
function readBody(req, limit=1_000_000) {
  return new Promise((resolve,reject) => {
    let raw='', size=0;
    req.on('data', chunk => { size += chunk.length; if(size > limit) { reject(new Error('Request body too large')); req.destroy(); } else raw += chunk; });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}
async function upstream(url, options={}, timeout=20000) {
  const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),timeout);
  try { return await fetch(url,{...options,signal:controller.signal}); } finally { clearTimeout(timer); }
}
const server = http.createServer(async (req,res) => {
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(s=>s.trim()).filter(Boolean);
  if(origin && allowed.includes(origin)) {
    res.setHeader('access-control-allow-origin',origin);
    res.setHeader('vary','Origin');
    res.setHeader('access-control-allow-headers','content-type, authorization');
    res.setHeader('access-control-allow-methods','GET, POST, OPTIONS');
  }
  if(req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url,'http://localhost');
  try {
    if(req.method==='GET' && url.pathname==='/api/health') return json(res,200,{
      ok:true, service:'GramSutra API', version:'2.0.0',
      pragatiAI:Boolean(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY),
      mandi:Boolean(process.env.DATA_GOV_IN_API_KEY),
      supabase:Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
    });
    if(req.method==='GET' && url.pathname==='/api/weather') {
      const lat=Number(url.searchParams.get('lat')), lon=Number(url.searchParams.get('lon'));
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) return json(res,400,{error:'Choose a valid location first.'});
      const q=new URL('https://api.open-meteo.com/v1/forecast');
      q.search=new URLSearchParams({latitude:String(lat),longitude:String(lon),current:'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',forecast_days:'3',timezone:'auto'}).toString();
      const r=await upstream(q,{headers:{accept:'application/json'}});
      if(!r.ok) return json(res,502,{error:'Weather provider is temporarily unavailable.'});
      return json(res,200,{source:'Open-Meteo',fetchedAt:new Date().toISOString(),data:await r.json()});
    }
    if(req.method==='GET' && url.pathname==='/api/mandi') {
      if(rateLimit(req,'mandi',15)) return json(res,429,{error:'Please wait before refreshing mandi prices.'});
      const key=process.env.DATA_GOV_IN_API_KEY;
      if(!key) return json(res,503,{error:'Live mandi data is not configured yet. Add DATA_GOV_IN_API_KEY on the server.'});
      const q=new URL('https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070');
      q.searchParams.set('api-key',key); q.searchParams.set('format','json'); q.searchParams.set('limit','30');
      for(const k of ['state','district','commodity']) { const v=(url.searchParams.get(k)||'').trim().slice(0,60); if(v) q.searchParams.set('filters['+k+']',v); }
      const r=await upstream(q,{headers:{accept:'application/json'}});
      if(!r.ok) return json(res,502,{error:'Mandi data provider returned an error.'});
      const data=await r.json();
      return json(res,200,{source:'data.gov.in · Agmarknet',fetchedAt:new Date().toISOString(),records:data.records||[],total:data.total||0});
    }
    if(req.method==='POST' && url.pathname==='/api/chat') {
      if(rateLimit(req,'chat',18)) return json(res,429,{error:'You have reached the short-term chat limit. Please try again later.'});
      const body=JSON.parse(await readBody(req,30000));
      const message=String(body.message||'').trim().slice(0,4000);
      if(!message) return json(res,400,{error:'Write a question for Pragati AI.'});
      const language=String(body.language||'English').slice(0,40);
      const system='You are Pragati AI, a careful agricultural information assistant for farmers in India. Reply in '+language+'. Give practical, accessible explanations. Ask for crop, region and crop stage when needed. Distinguish general information from locally verified advice. Do not claim certainty about disease diagnosis, and do not prescribe pesticide brands, chemical products or doses. Encourage users to verify high-impact decisions with a local Krishi Vigyan Kendra or agriculture officer. Never invent live prices, weather or scheme eligibility.';
      if(process.env.GROQ_API_KEY) {
        const r=await upstream('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+process.env.GROQ_API_KEY},body:JSON.stringify({model:process.env.GROQ_MODEL||'llama-3.3-70b-versatile',messages:[{role:'system',content:system},{role:'user',content:message}],temperature:0.35,max_tokens:900})},45000);
        const data=await r.json().catch(()=>({}));
        if(!r.ok) return json(res,r.status===429?429:502,{error:r.status===429?'AI service is busy. Try again shortly.':'Pragati AI provider request failed. Check the server configuration.'});
        return json(res,200,{reply:data.choices?.[0]?.message?.content||'I could not prepare a response. Please try again.',provider:'Groq',fetchedAt:new Date().toISOString()});
      }
      if(process.env.GEMINI_API_KEY) {
        const model=process.env.GEMINI_MODEL||'gemini-2.5-flash';
        const endpoint='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent';
        const r=await upstream(endpoint,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:message}]}],generationConfig:{temperature:0.35,maxOutputTokens:900}})},45000);
        const data=await r.json().catch(()=>({}));
        if(!r.ok) return json(res,502,{error:'Pragati AI provider request failed. Check the server configuration.'});
        return json(res,200,{reply:(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('\n')||'Please try again.',provider:'Gemini',fetchedAt:new Date().toISOString()});
      }
      return json(res,503,{error:'Pragati AI is not configured yet. Add GROQ_API_KEY or GEMINI_API_KEY to the server environment.'});
    }
    if(req.method==='GET') {
      let requested=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
      const file=path.resolve(PUBLIC,'.'+requested);
      if(!file.startsWith(PUBLIC+path.sep)) return json(res,403,{error:'Forbidden'});
      fs.readFile(file,(err,content)=>{
        if(err) { res.writeHead(404,{'content-type':'text/plain; charset=utf-8'}); return res.end('Not found'); }
        res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'});
        res.end(content);
      });
      return;
    }
    return json(res,404,{error:'Route not found'});
  } catch(err) {
    if(!res.headersSent) json(res,500,{error:'The request could not be completed.'});
    else res.destroy();
  }
});
server.listen(PORT,'0.0.0.0',()=>console.log('GramSutra 2.0 listening on '+PORT));
