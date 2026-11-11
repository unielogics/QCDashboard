import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Real loan page, funding tab and query/mutation hooks; fictional transport,
// auth and unrelated tabs. No production records or application server.
let script: Buffer;
test.beforeAll(async () => {
  const root = process.cwd(), require = createRequire(path.join(root, "package.json"));
  const esbuild = createRequire(createRequire(require.resolve("vitest/package.json")).resolve("vite/package.json"))("esbuild");
  const directory = await mkdtemp(path.join(os.tmpdir(), "qc-property-opening-"));
  const empty = "export const C=()=>null;";
  const mocks: Record<string, string> = {
    "next/navigation": "export const useParams=()=>({id:window.loanId});export const useSearchParams=()=>new URLSearchParams();",
    "@/lib/consoleAuth": "const auth={isLoaded:true,isSignedIn:true,getToken:async()=>'fictional-token'};export const useConsoleAuth=()=>auth;export const visualQaUser=()=>null;",
    "@/lib/api": "export class ApiError extends Error{};export const apiBase='https://property-opening.test';export const api=(...args)=>window.fixtureApi(...args);",
    "@/store/role": "export const useActiveProfile=()=>({role:'super_admin',email:'fictional@example.test'});",
    "@/store/ui": "export const useUI=fn=>fn({setAiOpen:()=>{}});",
    "@/hooks/useDealChannel": "export const useDealChannel=()=>{};",
    "@/hooks/useApi": `export{useLoan,useRecalc,useUpdateLoan}from'actual-use-api';const empty=()=>({data:[]});const mutation=()=>({mutate:()=>{}});export const useDocuments=empty,useLoanActivity=empty,useLoanPrequalRequests=empty;export const useClient=()=>({data:null}),useCurrentUser=()=>({data:null}),useUnifiedOperatorFile=()=>({data:null}),useStageTransition=mutation,useSendClientEmail=mutation;`,
    "@/components/design-system/primitives": "export const VerifiedBadge=()=>null;export const Pill=({children})=>children;export const StageBadge=()=>null;",
    "@/components/design-system/Icon": "export const Icon=()=>null;",
    "@/components/ds": `const Wrap=({children})=><div>{children}</div>;export const Btn=({children,onClick})=><button onClick={onClick}>{children}</button>;export const Kpi=({label,value,sub})=><div>{label}<strong>{value}</strong>{sub}</div>;export const Seg=()=>null;export const CG=Wrap,Card=Wrap,CellChip=Wrap,Chip=Wrap,IconBtn=Btn,KpiRow=Wrap,Panel=Wrap,StatusLine=Wrap,Tag=Wrap;export const cx=(...args)=>args.filter(Boolean).join(' ');`,
    "@/components/ds/Drawer": "export const Drawer=()=>null;",
    "@/components/ds/PageActionMenu": "export const PageActionMenu=()=>null;",
  };
  const unrelated = ["EmailComposer", "EmailsBreadcrumbTab", "FileBlockersPopup", "LoanSimulator", "LoanAgentPicker", "ApplicationVerificationWorkspace", "FileEconomicsDrawer", "PaymentsWorkspace"];
  await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import LoanDetailPage from'@/app/loans/[id]/page';import{useUpdateLoan}from'@/hooks/useApi';
    window.requests=[];window.loanId='loan-a';window.delay=0;const loans={};const make=id=>({id,address:id==='loan-a'?'Fictional property A':'Fictional property B',deal_id:'FICT',type:'dscr',stage:'collecting_docs',amount:100000,base_rate:0.1,final_rate:0.1,dscr:0.75,term_months:360,monthly_rent:2000,annual_taxes:1200,annual_insurance:600,monthly_hoa:0,discount_points:0,purpose:'refinance',arv:200000,ltv:0.5});loans['loan-a']=make('loan-a');loans['loan-b']=make('loan-b');
    window.fixtureApi=async(path,init={})=>{const method=init.method||'GET';const body=init.body?JSON.parse(init.body):null;window.requests.push({path,method,body});const id=path.split('/')[2];if(path.endsWith('/recalc')){await new Promise(r=>setTimeout(r,window.delay));return{loan_amount:body.loan_amount,final_rate:0.1,dscr:body.loan_amount===100000?1.25:2.5,warnings:[],sizing:{ltv:0.5}}}if(method==='PATCH')loans[id]={...loans[id],...body};return{...loans[id]}};
    const qc=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false},mutations:{retry:false}}});
    function Controls({onSwitch}){const edit=useUpdateLoan();return <nav><button onClick={()=>{window.delay=350;edit.mutate({loanId:window.loanId,amount:125000})}}>Edit amount</button><button onClick={()=>{window.delay=350;window.loanId='loan-b';onSwitch('loan-b')}}>Switch loan</button></nav>}
    function App(){const[id,setId]=useState('loan-a');return <QueryClientProvider client={qc}><Controls onSwitch={setId}/><LoanDetailPage data-route={id}/></QueryClientProvider>}createRoot(document.getElementById('root')).render(<App/>);
  ` }, bundle: true, outfile: path.join(directory, "fixture.js"), format: "iife", jsx: "automatic", platform: "browser", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "fictional-services", setup(build: { onResolve: (options: unknown, callback: (args: { path: string; importer: string }) => unknown) => void; onLoad: (options: unknown, callback: (args: { path: string }) => unknown) => void }) {
    build.onResolve({ filter: /.*/ }, ({ path: name, importer }) => {
      if (mocks[name]) return { path: name, namespace: "fixture" };
      if (name === "actual-use-api") return { path: path.join(root, "src/hooks/useApi.ts") };
      const base = name.split("/").at(-1)!;
      if (unrelated.includes(base) || (importer.endsWith("/page.tsx") || importer.endsWith("\\page.tsx")) && /^\.\/(tabs|components)\//.test(name) && base !== "FundingFileTab" || base === "PropertyTab") {
        mocks[name] = empty + `export const ${base}=C;`;
        return { path: name, namespace: "fixture" };
      }
      if (name.startsWith("@/")) {
        const location = path.join(root, "src", name.slice(2));
        return { path: [location, location + ".ts", location + ".tsx", path.join(location, "index.ts"), path.join(location, "index.tsx")].find(existsSync) ?? location };
      }
    });
    build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: name }) => ({ contents: mocks[name], loader: "tsx", resolveDir: root }));
  } }] });
  script = await readFile(path.join(directory, "fixture.js"));
});

test.beforeEach(async ({ page }) => {
  await page.route("https://property-opening.test/**", route => route.fulfill({ contentType: route.request().url().endsWith(".js") ? "application/javascript" : "text/html", body: route.request().url().endsWith(".js") ? script : "<html><body><div id='root'></div><script src='/fixture.js'></script></body></html>" }));
  await page.goto("https://property-opening.test");
});

test("one calculation on open, no read invalidation, and edits still refresh the shared result", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Fictional property A" })).toBeVisible();
  await expect(page.getByText("1.25", { exact: true }).first()).toBeVisible();
  const counts = () => page.evaluate(() => {
    const requests = (window as unknown as { requests: { method: string; path: string }[] }).requests;
    return { reads: requests.filter(r => r.method === "GET").length, calculations: requests.filter(r => r.path.endsWith("/recalc")).length, writes: requests.filter(r => r.method === "PATCH").length };
  });
  await expect.poll(counts).toEqual({ reads: 1, calculations: 1, writes: 0 });
  await page.getByRole("button", { name: "Edit amount", exact: true }).click();
  await expect.poll(counts).toEqual({ reads: 2, calculations: 2, writes: 1 });
  await expect(page.getByText("1.25", { exact: true })).toHaveCount(0);
  await expect(page.getByText("2.50", { exact: true }).first()).toBeVisible();
  await expect.poll(counts).toEqual({ reads: 2, calculations: 2, writes: 1 });
});

test("switching loans clears the preceding calculation while the next one is pending", async ({ page }) => {
  await expect(page.getByText("1.25", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Edit amount", exact: true }).click();
  await expect(page.getByText("2.50", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Switch loan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fictional property B" })).toBeVisible();
  await expect(page.getByText("2.50", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1.25", { exact: true }).first()).toBeVisible();
});
