// Capture a room's rendered geometry as a comparable fingerprint.
//
// A screenshot tells you it changed; this tells you WHAT changed. Every
// visible element's tag, class, box and key computed properties, keyed by a
// stable path — so a migration can be proven to have moved declarations
// without moving pixels.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const CHROME="/home/ubuntu/.cache/ms-playwright/chromium-1234/chrome-linux/chrome";
const BASE=process.env.BASE||"http://127.0.0.1:3111";
const ROUTE=process.argv[2], OUT=process.argv[3];
const WIDTHS=(process.env.WIDTHS||"1440,1024,390").split(",").map(Number);
const PORT=process.env.PORT||9227;
const chrome=spawn(CHROME,["--headless=new",`--remote-debugging-port=${PORT}`,"--no-sandbox","--disable-gpu","--disable-dev-shm-usage","--hide-scrollbars","about:blank"],{stdio:"ignore"});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); let id=1;
const url=await (async()=>{for(let i=0;i<80;i++){try{return (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl}catch{await sleep(250)}}})();
const ws=new WebSocket(url); const pend=new Map();
ws.addEventListener("message",e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){const p=pend.get(m.id);pend.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result)}});
await new Promise(r=>ws.addEventListener("open",r));
const send=(m,p={},s)=>new Promise((res,rej)=>{const i=id++;pend.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p,sessionId:s}))});
const {targetId}=await send("Target.createTarget",{url:"about:blank"});
const {sessionId}=await send("Target.attachToTarget",{targetId,flatten:true});
const S=(m,p)=>send(m,p,sessionId);
await S("Page.enable"); await S("Runtime.enable");

const FP = `(() => {
  const rows=[]; let i=0;
  const walk=(el,path)=>{
    const r=el.getBoundingClientRect();
    if(r.width||r.height){
      const cs=getComputedStyle(el);
      rows.push([path, el.tagName,
        Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height),
        cs.color, cs.backgroundColor, cs.fontSize, cs.fontWeight, cs.display,
        (el.childElementCount===0 ? (el.textContent||"").trim().slice(0,40) : "")
      ].join("|"));
    }
    let n=0; for(const c of el.children) walk(c, path+"/"+(n++)+c.tagName);
  };
  walk(document.body,"body");
  return rows;
})()`;

const out={route:ROUTE,base:BASE,widths:{}};
for (const w of WIDTHS) {
  await S("Emulation.setDeviceMetricsOverride",{width:w,height:1000,deviceScaleFactor:1,mobile:w<500});
  await S("Page.navigate",{url:BASE+ROUTE});
  for(let i=0;i<120;i++){await sleep(400);const r=await S("Runtime.evaluate",{expression:"document.readyState",returnByValue:true});if(r.result.value==="complete")break}
  await sleep(2500);
  const states={};
  states.gate=(await S("Runtime.evaluate",{returnByValue:true,expression:FP})).result.value;
  await S("Runtime.evaluate",{expression:`[...document.querySelectorAll("button")].find(x=>/continue in english/i.test(x.textContent))?.click()`});
  await sleep(4000);
  states.step1=(await S("Runtime.evaluate",{returnByValue:true,expression:FP})).result.value;
  const shot=await S("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});
  writeFileSync(`${OUT}.${w}.png`, Buffer.from(shot.data,"base64"));
  out.widths[w]=states;
  process.stderr.write(`  ${ROUTE} @${w}: gate ${states.gate.length} nodes, step1 ${states.step1.length} nodes\n`);
}
writeFileSync(OUT+".json", JSON.stringify(out));
chrome.kill(); process.exit(0);
