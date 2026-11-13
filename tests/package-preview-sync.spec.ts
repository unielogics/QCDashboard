import {expect,test,type Page,type Route,type TestInfo} from '@playwright/test';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {packageArtifactId,packageFileDetail,packagePreviewPdf,packageSnapshot,PACKAGE_INTAKE as INTAKE,PACKAGE_PROFILE as PROFILE} from './fixtures/packagePreviewSync';
let ORIGIN:string,server:Server,script:Buffer,css:Buffer,pdfjsRoot:string;
test.beforeAll(async()=>{
 server=createServer((request,response)=>{if(request.url?.startsWith('/immutable/')){response.writeHead(200,{'Content-Type':'application/pdf','Content-Length':packagePreviewPdf.length,'Content-Disposition':'attachment; filename=Synthetic-preview.pdf'});response.end(packagePreviewPdf);}else{response.writeHead(404);response.end();}});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));ORIGIN=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const root=process.cwd(),require=createRequire(path.join(root,'package.json')),esbuild=createRequire(createRequire(require.resolve('vitest/package.json')).resolve('vite/package.json'))('esbuild');pdfjsRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));const dir=await mkdtemp(path.join(os.tmpdir(),'qc-package-baseline-'));const names=[...(await readFile(path.join(root,'src/hooks/useApi.ts'),'utf8')).matchAll(/export (?:async )?(?:function|const|class) (\w+)/g)].map(x=>x[1]);
 const mocks:Record<string,string>={
 '@clerk/nextjs':"export const useAuth=()=>({isLoaded:true,isSignedIn:true,userId:'example-staff',sessionId:'example-session',getToken:async()=> 'synthetic-staff-token'});export const useUser=()=>({isLoaded:true,isSignedIn:true,user:{id:'example-staff'}});export const ClerkProvider=({children})=>children;export const SignedIn=({children})=>children;export const SignedOut=()=>null;export const UserButton=()=>null;export const SignInButton=({children})=>children;export const SignOutButton=({children})=>children;",
 '@/hooks/useApi':`const call=(...args)=>window.fixtureApi(...args);${names.map(n=>n==='useCurrentUser'?"export const useCurrentUser=()=>({data:{id:'example-staff',role:'super_admin'},authReady:true,authScope:'example-staff:session',isLoading:false});":n==='useAuthedApi'?"export const useAuthedApi=()=>call;":`export const ${n}=()=>({data:null,isLoading:false,isPending:false,refetch:async()=>({}),mutateAsync:async()=>({})});`).join('\n')}`,
 '@/lib/consoleAuth':"const getToken=async()=> 'synthetic-staff-token';export const isVisualQa=false;export const visualQaUser=()=>null;export const useConsoleAuth=()=>({isLoaded:true,isSignedIn:true,userId:'example-staff',sessionId:'example-session',getToken});",
 '@/components/admin/AIReviewProvider':"export const useAIReview=()=>({requestReview:()=>{},isReviewing:()=>false});",
 '@/components/operator/UnifiedOperator':"export const BucketIntakeLinkDrawer=()=>null;",
 '@/components/file/cockpit/FinancialCockpit':"import{marketplaceCockpit}from'./tests/fixtures/marketplacePanel';export const FinancialCockpit=props=>props.renderFundingPackage?.(null,marketplaceCockpit());",
 './InvestorPackageDetails':"export const InvestorPackageDetails=()=>null;export const InvestorReportReferenceButton=()=>null;",
 '@/components/application/CapitalReadinessPanel':"export const CapitalReadinessPanel=()=>null;",
 'next/link':"export default({href,children,prefetch,...props})=><a href={href} {...props}>{children}</a>;",
 'next/navigation':`const router={push:()=>{},replace:()=>{}};const search=new URLSearchParams(location.search);export const useParams=()=>({id:'${INTAKE}'});export const useRouter=()=>router;export const useSearchParams=()=>search;export const usePathname=()=>location.pathname;`,
 'next/dynamic':"import React,{lazy,Suspense}from'react';export default(loader,options={})=>{const C=lazy(async()=>{const v=await loader();return typeof v==='function'?{default:v}:v});return p=><Suspense fallback={options.loading?React.createElement(options.loading):null}><C {...p}/></Suspense>};",
 };mocks['./useApi']=mocks['@/hooks/useApi'];
 await esbuild.build({stdin:{resolveDir:root,loader:'tsx',contents:`import React from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import Page from'@/app/files/[id]/page';import{ConfirmationProvider}from'@/components/design-system/ConfirmationProvider';import'@/app/globals.css';import'@/app/app-extras.css';window.fixtureApi=async(path,options={})=>{const r=await fetch('${ORIGIN}/api/v1'+path,{...options,headers:{Authorization:'Bearer synthetic-staff-token','Content-Type':'application/json'}});if(!r.ok)throw Error('Synthetic API error');return r.json()};createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><ConfirmationProvider><main style={{padding:16,maxWidth:1320,margin:'auto'}}><Page/></main></ConfirmationProvider></QueryClientProvider>);`},outfile:path.join(dir,'app.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',nodePaths:[path.join(root,'node_modules')],alias:{'@':path.join(root,'src')},define:{'process.env':JSON.stringify({NODE_ENV:'development',NEXT_PUBLIC_API_URL:ORIGIN})},external:['node:module','node:fs','node:fs/promises','node:url','node:path','@napi-rs/canvas'],loader:{'.module.css':'local-css'},logLevel:'silent',plugins:[{name:'synthetic-unrelated-services',setup(build:any){build.onResolve({filter:/.*/},(a:any)=>a.path in mocks?{path:a.path==='./useApi'?'@/hooks/useApi':a.path,namespace:'synthetic'}:undefined);build.onLoad({filter:/.*/,namespace:'synthetic'},(a:any)=>({contents:mocks[a.path],loader:'tsx',resolveDir:root}));}}]});[script,css]=await Promise.all([readFile(path.join(dir,'app.js')),readFile(path.join(dir,'app.css'))]);
 const config=require('tailwindcss/loadConfig')(path.join(root,'tailwind.config.ts'));css=Buffer.from((await require('postcss')([require('tailwindcss')({...config,content:[path.join(root,'src/**/*.{ts,tsx}')]})]).process(css.toString(),{from:path.join(dir,'app.css')})).css);
});

test.afterAll(async()=>{if(server)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});

// Real FilePage/useLeadFile/LeadDetailPanel/package cards/history/PDF reader.
// Unrelated cockpit is adapted only by invoking its actual renderFundingPackage prop.
type ObservedRequest = { method: string; path: string; auth: string };
async function fixture(page: Page) {
  let version = 6, metadataFailure = false, linkFailure = false, mismatchedLink = false;
  const requests: ObservedRequest[] = [], errors: string[] = [], pdfReads: { id: string; sha256: string }[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const handler = async (route: Route) => {
    const req=route.request(),url=new URL(req.url());expect(url.origin).toBe(ORIGIN);
    if(url.pathname.startsWith('/pdfjs/')) {
      const relative=url.pathname.slice('/pdfjs/'.length),asset=relative==='pdf.worker.min.mjs'?path.join(pdfjsRoot,'legacy/build/pdf.worker.min.mjs'):/^(wasm|standard_fonts|cmaps|iccs)\/[a-zA-Z0-9_.-]+$/.test(relative)?path.join(pdfjsRoot,relative):null;
      if(asset&&(await stat(asset)).isFile())return route.fulfill({contentType:relative.endsWith('.mjs')?'text/javascript':relative.endsWith('.wasm')?'application/wasm':'application/octet-stream',body:await readFile(asset)});
      return route.fulfill({status:404,body:'Unknown PDF asset'});
    }
    if(url.pathname.startsWith('/immutable/')) { const id=decodeURIComponent(url.pathname.split('/').pop()!.replace(/\.pdf$/,''));pdfReads.push({id,sha256:createHash('sha256').update(packagePreviewPdf).digest('hex')});return route.fulfill({contentType:'application/pdf',headers:{'Content-Disposition':`${url.searchParams.get('download')==='true'?'attachment':'inline'}; filename=Synthetic-preview.pdf`},body:packagePreviewPdf}); }
    if(url.pathname.startsWith('/expired-'))throw Error('Cached artifact URL was used instead of fresh protected URL');
    if(!url.pathname.startsWith('/api/v1/'))return route.fulfill(url.pathname==='/app.js'?{contentType:'text/javascript',body:script}:url.pathname==='/app.css'?{contentType:'text/css',body:css}:{contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'});
    const p=url.pathname.slice(7);requests.push({method:req.method(),path:p+url.search,auth:req.headers().authorization||''});expect(req.method()).toBe('GET');expect(req.headers().authorization).toBe('Bearer synthetic-staff-token');
    const json=(value:unknown)=>route.fulfill({json:value}),base=`/admin/ai-underwriter-leads/${INTAKE}`;
    if(p===base+'/artifacts') {if(metadataFailure){return route.fulfill({status:503,json:{detail:'Synthetic saved package check unavailable'}});}return json(packageSnapshot(version,ORIGIN));}
    if(p.startsWith(base+'/artifacts/')&&p.endsWith('/url')) {const id=decodeURIComponent(p.slice((base+'/artifacts/').length,-4));if(linkFailure){return route.fulfill({status:503,json:{detail:'Synthetic preview temporarily unavailable'}});}const requestedVersion=Number(id.match(/v(\d+)$/)![1]);return json({artifact_id:mismatchedLink?'different-artifact':id,version:requestedVersion,content_type:'application/pdf',disposition:url.searchParams.get('download')==='true'?'attachment':'inline',expires_in_seconds:900,url:`${ORIGIN}/immutable/${encodeURIComponent(id)}.pdf?download=${url.searchParams.get('download')}`});}
    if(p===base)return json(packageFileDetail(ORIGIN));
    if(p.endsWith('/marketplace-publication'))return json({profile_id:PROFILE,can_manage:true,listing:null});
    if(p.startsWith('/capital/admin/sources/lookup'))return json({profile_id:PROFILE,listing:null,sync:null});
    if(p.endsWith('/program-readiness'))return json({profile_id:PROFILE,selections:[],requirements:[],programs:[],can_advance:false,available_evidence_files:[],evidence_policies:[],candidates:[],automation:{enabled:false}});
    if(p.includes('/underwriting'))return json({profile_id:PROFILE,underwriting_status:'in_underwriting'});
    throw Error('Unexpected synthetic API '+p);
  };
  await page.route('**/*',handler);await page.context().route(ORIGIN+'/immutable/**',handler);
  await page.goto(ORIGIN+'/files/'+INTAKE+'?workspace=package');
  await page.getByRole('tab',{name:'Financials',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Investor package & capital partners',exact:true})).toBeVisible();
  await expect(page.locator('.package-document-card')).toHaveCount(3);
  await expect.poll(()=>requests.filter(row=>row.path.endsWith('/artifacts')).length).toBeGreaterThan(0);
  return {requests,errors,pdfReads,setVersion:(v:number)=>{version=v;},failLink:()=>{linkFailure=true;},recoverLink:()=>{linkFailure=false;},failMetadata:()=>{metadataFailure=true;},recoverMetadata:()=>{metadataFailure=false;},mismatchLink:(v:boolean)=>{mismatchedLink=v;}};
}
const reader=(page:Page)=>page.getByRole('dialog',{name:'Package PDF preview',exact:true});
const packet=(page:Page,version:number)=>page.locator('.package-document-card').filter({hasText:`sample lender_packet v${version}`});
async function assertCards(page:Page,version:number) {for(const kind of ['executive_summary','lender_packet','investor_presentation'])await expect(page.locator('.package-document-card').filter({hasText:`sample ${kind} v${version}`})).toBeVisible();}
async function ink(page:Page) {return reader(page).locator('canvas').evaluateAll(nodes=>nodes.map(node=>{const c=node as HTMLCanvasElement,ctx=c.getContext('2d');if(!ctx||!c.width||!c.height)return 0;const data=ctx.getImageData(0,0,c.width,c.height).data;let count=0;for(let i=0;i<data.length;i+=4)if(data[i+3]&&data[i]<220&&data[i+1]<220&&data[i+2]<220)count++;return count;}));}
async function rendered(page:Page,version:number){await expect(reader(page)).toBeVisible();await expect(reader(page)).toContainText(`Saved v${version}`);await expect(reader(page).locator('canvas')).toHaveCount(3);await expect.poll(async()=>{const values=await ink(page);return values.length===3&&values.every(value=>value>500);}).toBe(true);}
async function capture(page:Page,f:Awaited<ReturnType<typeof fixture>>,name:string,info:TestInfo){const dir=process.env.QC_PACKAGE_ARTIFACT_DIR||info.outputPath('package-preview-sync');await mkdir(dir,{recursive:true});await page.screenshot({path:path.join(dir,name+'.png')});await writeFile(path.join(dir,name+'.json'),JSON.stringify({requests:f.requests,pdfReads:f.pdfReads,ink:await ink(page),errors:f.errors,pdf_sha256:createHash('sha256').update(packagePreviewPdf).digest('hex'),viewport:page.viewportSize()},null,2));expect(f.errors).toEqual([]);expect(f.requests.every(row=>row.method==='GET')).toBe(true);}

async function captureCards(page:Page,name:string,info:TestInfo){const dir=process.env.QC_PACKAGE_ARTIFACT_DIR||info.outputPath('package-preview-sync');await mkdir(dir,{recursive:true});await page.locator('.package-readiness-overview').screenshot({path:path.join(dir,name+'.png')});}

test('desktop: real PDF reader remints links, pins v6 during v7 metadata refresh, and retains immutable history',async({page},info)=>{
 await page.clock.install();const f=await fixture(page);await assertCards(page,6);
 await packet(page,6).getByRole('button',{name:/^Preview /}).click();await rendered(page,6);
 expect(f.pdfReads.at(-1)?.id).toBe(packageArtifactId('lender_packet',6));
 const reads=f.requests.filter(row=>row.path.endsWith('/artifacts')).length;expect(reads).toBeGreaterThan(0);f.setVersion(7);await page.clock.runFor(16000);await expect.poll(()=>f.requests.filter(row=>row.path.endsWith('/artifacts')).length).toBeGreaterThan(reads);await expect(reader(page)).toContainText('A newer saved PDF is available');await rendered(page,6);expect(f.pdfReads.every(row=>row.id===packageArtifactId('lender_packet',6))).toBe(true);
 await capture(page,f,'desktop-v6-pinned-after-v7',info);await reader(page).getByRole('button',{name:'Close review',exact:true}).click();await assertCards(page,7);await captureCards(page,'desktop-v7-current-package',info);
 await packet(page,7).getByRole('button',{name:/^Preview /}).click();await rendered(page,7);expect(f.pdfReads.at(-1)?.id).toBe(packageArtifactId('lender_packet',7));await capture(page,f,'desktop-v7-canvas',info);
 await reader(page).getByRole('button',{name:'Close review',exact:true}).click();await page.getByRole('tab',{name:/Version history$/}).click();await page.getByRole('button',{name:'Preview Lender package version 6',exact:true}).click();await rendered(page,6);await capture(page,f,'desktop-history-v6-canvas',info);
});

test('mobile: background metadata and explicit check update coherent cards while delivery drafts survive; failed reads retry',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});await page.clock.install();const f=await fixture(page);await page.getByRole('tab',{name:/Delivery$/}).click();
 const subject=page.getByPlaceholder('Prepare a lender submission'),message=page.getByPlaceholder('Draft the reviewed submission message');await subject.fill('Synthetic unsent subject');await message.fill('Synthetic message retained while package advances.');await subject.focus();
 const originalFacts=f.requests.filter(row=>row.path.split('?')[0]===`/admin/ai-underwriter-leads/${INTAKE}`).length;expect(originalFacts).toBeGreaterThan(0);f.setVersion(7);await page.clock.runFor(16000);await expect(subject).toHaveValue('Synthetic unsent subject');await expect(message).toHaveValue('Synthetic message retained while package advances.');await expect(subject).toBeFocused();
 f.failMetadata();await page.getByRole('button',{name:'Check saved package',exact:true}).click();await expect(page.getByText(/Saved package check failed/)).toBeVisible();await expect(message).toHaveValue('Synthetic message retained while package advances.');f.recoverMetadata();await page.getByRole('button',{name:'Check saved package',exact:true}).click();await expect(page.getByText(/Saved package check failed/)).toHaveCount(0);expect(f.requests.filter(row=>row.path.split('?')[0]===`/admin/ai-underwriter-leads/${INTAKE}`).length).toBe(originalFacts);
 await page.getByRole('tab',{name:/Package & presentation$/}).click();await assertCards(page,7);await captureCards(page,'mobile-v7-current-package',info);await packet(page,7).getByRole('button',{name:/^Preview /}).click();await rendered(page,7);await capture(page,f,'mobile-v7-preview',info);const geometry=await reader(page).evaluate(el=>({width:el.getBoundingClientRect().width,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth}));expect(geometry.width).toBeLessThanOrEqual(geometry.viewport+1);expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport+1);
});

test('desktop: protected preview failure and mismatched artifact cannot show wrong PDF, explicit retry recovers and download stays pinned',async({page},info)=>{
 const f=await fixture(page);f.failLink();await packet(page,6).getByRole('button',{name:/^Preview /}).click();await expect(reader(page).getByText(/Synthetic preview temporarily unavailable/)).toBeVisible();await expect(reader(page).locator('canvas')).toHaveCount(0);f.recoverLink();await reader(page).getByRole('button',{name:'Retry preview',exact:true}).click();await rendered(page,6);
 f.mismatchLink(true);await reader(page).getByRole('button',{name:'Retry preview',exact:true}).click();await expect(reader(page).getByText(/PDF does not match the selected saved version/)).toBeVisible();await expect(reader(page).locator('canvas')).toHaveCount(0);f.mismatchLink(false);await reader(page).getByRole('button',{name:'Retry preview',exact:true}).click();await rendered(page,6);
 const downloaded=page.waitForEvent('download');await reader(page).getByRole('button',{name:'Download this file',exact:true}).click();expect(await readFile((await (await downloaded).path())!)).toEqual(packagePreviewPdf);expect(f.requests.at(-1)?.path).toContain('download=true');await capture(page,f,'desktop-preview-retry',info);
});
