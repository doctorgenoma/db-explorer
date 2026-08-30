let SQL = null;
let db = null;
let dbFileName = "";
let currentTable = null;
let columns = [];
let allRows = [];
let filteredRows = [];
let page = 1;
const PAGE_SIZE = 100;
let sqlMode = false;
let sortIndex = -1;
let sortDir = 1;
let selected = new Set();

const $ = id => document.getElementById(id);

async function init() {
  try {
    SQL = await initSqlJs({
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/${file}`
    });
    ["dbFile","dbFileWelcome"].forEach(id => $(id).addEventListener("change", e => loadFile(e.target.files[0])));
    $("search").addEventListener("input", debounce(applyFilter, 120));
    $("searchColumn").addEventListener("change", applyFilter);
    $("caseSensitive").addEventListener("change", applyFilter);
    $("clearSearch").addEventListener("click", () => { $("search").value=""; applyFilter(); });
    $("prevPage").addEventListener("click", () => { if(page>1){page--;renderTable();}});
    $("nextPage").addEventListener("click", () => { if(page<Math.ceil(filteredRows.length/PAGE_SIZE)){page++;renderTable();}});
    $("exportBtn").addEventListener("click", exportResults);
    $("csvBtn").addEventListener("click", exportCSV);
    $("exportSelectedBtn").addEventListener("click", exportSelected);
    $("clearSelectionBtn").addEventListener("click", clearSelection);
    $("refreshBtn").addEventListener("click", () => currentTable && openTable(currentTable));
    $("advancedToggle").addEventListener("click", () => {
      $("advancedBody").classList.toggle("hidden");
      $("advancedToggle").textContent = $("advancedBody").classList.contains("hidden") ? "▸ Consulta SQL avanzada" : "▾ Consulta SQL avanzada";
    });
    $("runSql").addEventListener("click", runSQL);
    $("statsToggle").addEventListener("click", () => $("statsPanel").classList.toggle("hidden"));
  } catch(e) { toast("No se pudo cargar SQLite: " + e.message); }
}

async function loadFile(file) {
  if (!file) return;
  try {
    toast("Cargando " + file.name + "…");
    const buffer = await file.arrayBuffer();
    db = new SQL.Database(new Uint8Array(buffer));
    dbFileName = file.name;
    $("dbName").textContent = file.name;
    $("welcome").classList.add("hidden");
    $("app").classList.remove("hidden");
    loadTables();
    buildCatalog();
  } catch(e) { db=null; toast("No se pudo abrir el archivo: " + e.message); }
}

function loadTables() {
  const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const names = result.length ? result[0].values.map(r=>r[0]) : [];
  $("tableCount").textContent = names.length;
  $("tables").innerHTML = names.length ? "" : '<div class="empty">No hay tablas de usuario.</div>';
  names.forEach(name => {
    const b=document.createElement("button");
    b.className="table-item";
    b.innerHTML=`<span>${escapeHtml(name)}</span><small>${getCount(name).toLocaleString("es-ES")}</small>`;
    b.addEventListener("click",()=>openTable(name)); b.dataset.table=name;
    $("tables").appendChild(b);
  });
  if(names.length) openTable(names[0]);
}

function getCount(name) {
  try{return db.exec(`SELECT COUNT(*) FROM ${quoteId(name)}`)[0].values[0][0]||0}catch{return 0}
}

function openTable(name) {
  currentTable=name; sqlMode=false; sortIndex=-1; sortDir=1; selected.clear();
  document.querySelectorAll(".table-item").forEach(b=>b.classList.toggle("active",b.dataset.table===name));
  $("currentTable").textContent=name; $("search").value="";
  const info=db.exec(`PRAGMA table_info(${quoteId(name)})`);
  columns=info.length?info[0].values.map(r=>r[1]):[];
  fillSearchColumns();
  const res=db.exec(`SELECT * FROM ${quoteId(name)}`);
  allRows=res.length?res[0].values:[]; filteredRows=allRows.slice(); page=1;
  $("rowCount").textContent=allRows.length.toLocaleString("es-ES");
  $("columnCount").textContent=columns.length;
  renderTable(); renderAnalytics();
}

function fillSearchColumns(){
  $("searchColumn").innerHTML='<option value="__all__">Todas las columnas</option>';
  columns.forEach(c=>$("searchColumn").insertAdjacentHTML("beforeend",`<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`));
}

function applyFilter(){
  if(!columns.length)return;
  const term=$("search").value, col=$("searchColumn").value, sensitive=$("caseSensitive").checked;
  const needle=sensitive?term:term.toLocaleLowerCase();
  filteredRows=!term?allRows.slice():allRows.filter(row=>{
    const vals=col==="__all__"?row:[row[columns.indexOf(col)]];
    return vals.some(v=>{if(v===null||v===undefined)return false;const s=String(v);return(sensitive?s:s.toLocaleLowerCase()).includes(needle)});
  });
  page=1; renderTable(); renderAnalytics();
}

function sortBy(i){
  if(sortIndex===i)sortDir*=-1; else {sortIndex=i;sortDir=1}
  filteredRows.sort((a,b)=>compare(a[i],b[i])*sortDir);
  page=1;renderTable();
}

function compare(a,b){
  if(a===b)return 0;if(a===null)return -1;if(b===null)return 1;
  const na=Number(a),nb=Number(b);
  if(String(a).trim()!==""&&String(b).trim()!==""&&Number.isFinite(na)&&Number.isFinite(nb))return na-nb;
  return String(a).localeCompare(String(b),"es",{numeric:true,sensitivity:"base"});
}

function renderTable(){
  const start=(page-1)*PAGE_SIZE,end=Math.min(start+PAGE_SIZE,filteredRows.length),shown=filteredRows.slice(start,end);
  const pages=Math.max(1,Math.ceil(filteredRows.length/PAGE_SIZE));
  $("resultInfo").textContent=`${filteredRows.length.toLocaleString("es-ES")} resultados`;
  $("pageInfo").textContent=`página ${page} / ${pages}`;
  $("pageNumber").textContent=page;
  $("prevPage").disabled=page<=1;$("nextPage").disabled=page>=pages;
  if(!columns.length){$("tableWrap").innerHTML='<div class="empty">La consulta no devuelve columnas.</div>';return}
  let html='<table class="data-table"><thead><tr><th class="select-col"><input id="selectAllPage" type="checkbox"></th>';
  columns.forEach((c,i)=>{const arrow=sortIndex===i?(sortDir===1?" ▲":" ▼"):"";html+=`<th><button class="th-sort" data-col="${i}">${escapeHtml(c)}${arrow}</button></th>`});
  html+='</tr></thead><tbody>';
  shown.forEach((row,j)=>{
    const globalIndex=start+j, checked=selected.has(globalIndex)?" checked":"";
    html+=`<tr><td class="select-col"><input class="row-check" data-index="${globalIndex}" type="checkbox"${checked}></td>`;
    row.forEach(v=>html+=`<td title="${escapeAttr(formatValue(v))}">${v===null?'<span class="null">NULL</span>':escapeHtml(formatValue(v))}</td>`);
    html+='</tr>';
  });
  html+='</tbody></table>'; $("tableWrap").innerHTML=html;
  document.querySelectorAll(".th-sort").forEach(b=>b.addEventListener("click",()=>sortBy(Number(b.dataset.col))));
  document.querySelectorAll(".row-check").forEach(c=>c.addEventListener("change",()=>{const i=Number(c.dataset.index);c.checked?selected.add(i):selected.delete(i);updateSelectionUI()}));
  const sa=$("selectAllPage"); sa.addEventListener("change",()=>{shown.forEach((_,j)=>{const i=start+j;sa.checked?selected.add(i):selected.delete(i)});renderTable();});
  sa.checked=shown.length>0&&shown.every((_,j)=>selected.has(start+j));
  updateSelectionUI();
}

function updateSelectionUI(){
  $("selectionCount").textContent=`${selected.size.toLocaleString("es-ES")} seleccionadas`;
  $("exportSelectedBtn").disabled=selected.size===0;
  $("clearSelectionBtn").disabled=selected.size===0;
}

function clearSelection(){selected.clear();renderTable()}

function renderAnalytics(){
  const rows=filteredRows;
  $("filteredCount").textContent=rows.length.toLocaleString("es-ES");
  $("selectedCountStat").textContent=selected.size.toLocaleString("es-ES");
  const extIndex=columns.findIndex(c=>c.toLowerCase()==="extension");
  const sizeIndex=columns.findIndex(c=>["tamaño_mb","tamano_mb","size_mb","tamaño","tamano"].includes(c.toLowerCase()));
  const dateIndex=columns.findIndex(c=>["fecha_modif","fecha","date","modified"].includes(c.toLowerCase()));
  let extHtml="";
  if(extIndex>=0){
    const m=new Map();
    rows.forEach(r=>{let x=r[extIndex];x=(x===null||x==="")?"(sin extensión)":String(x).toLowerCase();m.set(x,(m.get(x)||0)+1)});
    [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([x,n])=>extHtml+=`<tr><td>${escapeHtml(x)}</td><td>${n.toLocaleString("es-ES")}</td><td><div class="bar"><i style="width:${Math.max(2,Math.round(n/rows.length*100))}%"></i></div></td></tr>`);
  }
  $("extensionStats").innerHTML=extHtml||'<tr><td colspan="3" class="muted">No se encontró una columna "extension".</td></tr>';
  if(sizeIndex>=0){
    const nums=rows.map(r=>Number(r[sizeIndex])).filter(Number.isFinite);
    const total=nums.reduce((a,b)=>a+b,0);
    $("sizeStats").textContent=`Total: ${total.toLocaleString("es-ES",{maximumFractionDigits:2})} · Media: ${(nums.length?total/nums.length:0).toLocaleString("es-ES",{maximumFractionDigits:2})}`;
  } else $("sizeStats").textContent="No se encontró una columna de tamaño.";
  if(dateIndex>=0){
    const dates=rows.map(r=>r[dateIndex]).filter(Boolean).map(String).sort();
    $("dateStats").textContent=dates.length?`Desde ${dates[0]} · hasta ${dates[dates.length-1]}`:"Sin fechas";
  } else $("dateStats").textContent="No se encontró una columna de fecha.";
}

function runSQL(){
  const q=$("sqlInput").value.trim();
  if(!q)return toast("Escribe una consulta.");
  if(!/^(SELECT|WITH|PRAGMA)\b/i.test(q))return toast("Por seguridad, solo SELECT, WITH y PRAGMA.");
  try{
    const res=db.exec(q); if(!res.length){$("tableWrap").innerHTML='<div class="empty">La consulta no devuelve filas.</div>';return}
    columns=res[0].columns;allRows=res[0].values;filteredRows=allRows.slice();page=1;sqlMode=true;currentTable=null;selected.clear();
    $("currentTable").textContent="Resultado SQL";$("columnCount").textContent=columns.length;$("rowCount").textContent=allRows.length.toLocaleString("es-ES");
    $("search").value="";fillSearchColumns();renderTable();renderAnalytics();toast("Consulta ejecutada.");
  }catch(e){toast("SQL: "+e.message)}
}

function rowsForExport(){
  return selected.size? [...selected].sort((a,b)=>a-b).map(i=>filteredRows[i]).filter(Boolean):filteredRows;
}

function exportResults(){
  if(!columns.length)return toast("No hay datos para exportar.");
  try{
    const data=[columns,...rowsForExport()],ws=XLSX.utils.aoa_to_sheet(data),wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Resultados");
    const base=(dbFileName||"database").replace(/\.[^.]+$/,""),suffix=sqlMode?"consulta":(currentTable||"resultados");
    XLSX.writeFile(wb,`${base}_${suffix}.xlsx`);toast("Excel generado.");
  }catch(e){toast("No se pudo exportar: "+e.message)}
}

function exportSelected(){if(!selected.size)return;exportResults()}

function exportCSV(){
  const rows=rowsForExport();if(!columns.length||!rows.length)return toast("No hay datos para exportar.");
  const csv=[columns,...rows].map(r=>r.map(csvCell).join(",")).join("\r\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=`${(dbFileName||"database").replace(/\.[^.]+$/,"")}_resultados.csv`;a.click();URL.revokeObjectURL(a.href);toast("CSV generado.");
}

function csvCell(v){if(v===null||v===undefined)return"";if(v instanceof Uint8Array)return`[BLOB ${v.byteLength} bytes]`;const s=String(v);return`"${s.replaceAll('"','""')}"`}
function quoteId(s){return '"'+String(s).replaceAll('"','""')+'"'}
function formatValue(v){if(v instanceof Uint8Array)return`[BLOB ${v.byteLength} bytes]`;return String(v)}
function escapeHtml(s){return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function escapeAttr(s){return escapeHtml(s)}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}
let toastTimer;function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2800)}

let fileCatalog = [];
let explorerRows = [];
let currentFolder = "";

function setupExplorer() {
  $("extFilter").addEventListener("change", applyExplorerFilters);
  $("sizeFilter").addEventListener("change", applyExplorerFilters);
  $("dateFrom").addEventListener("change", applyExplorerFilters);
  $("dateTo").addEventListener("change", applyExplorerFilters);
  $("clearExplorerFilters").addEventListener("click", () => {
    $("extFilter").value=""; $("sizeFilter").value=""; $("dateFrom").value=""; $("dateTo").value="";
    currentFolder=""; applyExplorerFilters();
  });
  $("rootFolderBtn").addEventListener("click",()=>{currentFolder="";renderFolders()});
  $("copyVisiblePathsBtn").addEventListener("click",copyVisiblePaths);
}

function buildCatalog() {
  if (!db) return;
  const names = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values.map(r=>r[0])||[];
  const table = names.find(n=>n.toLowerCase()==="archivos") || names[0];
  if (!table) return;
  const info=db.exec(`PRAGMA table_info(${quoteId(table)})`);
  const cols=info[0]?.values.map(r=>r[1])||[];
  const res=db.exec(`SELECT * FROM ${quoteId(table)}`);
  const rows=res[0]?.values||[];
  const idx=n=>cols.findIndex(c=>c.toLowerCase()===n);
  const iExt=idx("extension"), iRoot=idx("carpeta_raiz"), iSub=idx("subcarpeta"), iPath=idx("ruta_relativa"), iName=idx("nombre"), iSize=idx("tamaño_mb"), iDate=idx("fecha_modif");
  fileCatalog=rows.map((r,i)=>({
    i, extension:iExt>=0?String(r[iExt]??"").replace(/^\./,"").toLowerCase():"",
    root:iRoot>=0?String(r[iRoot]??""):"",
    sub:iSub>=0?String(r[iSub]??""):"",
    path:iPath>=0?String(r[iPath]??""):"",
    name:iName>=0?String(r[iName]??""):String(r[0]??""),
    size:iSize>=0?Number(r[iSize]):NaN,
    date:iDate>=0?String(r[iDate]??""):""
  }));
  const exts=[...new Set(fileCatalog.map(x=>x.extension).filter(Boolean))].sort();
  $("extFilter").innerHTML='<option value="">Todas las extensiones</option>'+exts.map(x=>`<option value="${escapeAttr(x)}">${escapeHtml(x.toUpperCase())}</option>`).join("");
  explorerRows=fileCatalog.slice(); renderFolders();
}

function applyExplorerFilters() {
  const ext=$("extFilter").value, min=Number($("sizeFilter").value)||0, from=$("dateFrom").value, to=$("dateTo").value;
  explorerRows=fileCatalog.filter(x=>
    (!ext||x.extension===ext) &&
    (!min||(Number.isFinite(x.size)&&x.size>=min)) &&
    (!from||dateOnly(x.date)>=from) &&
    (!to||dateOnly(x.date)<=to)
  );
  if(!explorerRows.some(x=>folderPath(x)===currentFolder)) currentFolder="";
  renderFolders();
}

function folderPath(x) {
  return [x.root,x.sub].filter(Boolean).join("/").replace(/^\/+|\/+$/g,"");
}
function dateOnly(s) {
  const m=String(s||"").match(/\d{4}-\d{2}-\d{2}/); return m?m[0]:"";
}

function renderFolders() {
  const root=currentFolder;
  const directFiles=explorerRows.filter(x=>folderPath(x)===root);
  const prefixes=new Map();
  explorerRows.forEach(x=>{
    const p=folderPath(x);
    if(!p.startsWith(root?root+"/":"")) return;
    const rest=p.slice(root?(root.length+1):0);
    if(!rest) return;
    const first=rest.split("/")[0];
    const full=root?(root+"/"+first):first;
    prefixes.set(full,(prefixes.get(full)||0)+1);
  });
  let html="";
  [...prefixes.entries()].sort((a,b)=>a[0].localeCompare(b[0],"es")).forEach(([p,n])=>{
    const label=p.split("/").pop();
    html+=`<button class="folder-item" data-folder="${escapeAttr(p)}">📁 <b>${escapeHtml(label)}</b><small>${n.toLocaleString("es-ES")} archivos</small></button>`;
  });
  if(directFiles.length){
    html+=`<div class="folder-summary">📄 ${directFiles.length.toLocaleString("es-ES")} archivos en esta carpeta</div>`;
    directFiles.slice(0,200).forEach(x=>{
      html+=`<div class="file-item"><span>📄 <b>${escapeHtml(x.name)}</b></span><span class="file-meta">${escapeHtml(x.extension||"—")} · ${Number.isFinite(x.size)?x.size.toLocaleString("es-ES")+" MB":"—"} · <button class="copy-path" data-path="${escapeAttr(x.path)}">Copiar ruta</button></span></div>`;
    });
    if(directFiles.length>200) html+=`<div class="folder-summary">Mostrando 200 de ${directFiles.length.toLocaleString("es-ES")}. Usa los filtros para reducir resultados.</div>`;
  }
  if(!html) html='<div class="empty">No hay carpetas o archivos que coincidan con los filtros.</div>';
  $("folderBrowser").innerHTML=html;
  document.querySelectorAll(".folder-item").forEach(b=>b.addEventListener("click",()=>{currentFolder=b.dataset.folder;renderFolders()}));
  document.querySelectorAll(".copy-path").forEach(b=>b.addEventListener("click",()=>copyText(b.dataset.path)));
  $("folderBreadcrumb").textContent=root?" / "+root:"";
}

async function copyVisiblePaths(){
  const rows=explorerRows.filter(x=>folderPath(x)===currentFolder).slice(0,2000);
  if(!rows.length)return toast("No hay rutas visibles.");
  await copyText(rows.map(x=>x.path).join("\n"));
}
async function copyText(text){
  try{await navigator.clipboard.writeText(text);toast("Ruta(s) copiadas al portapapeles.");}
  catch{toast("No se pudo acceder al portapapeles.");}
}

setupExplorer();
init();
if("serviceWorker"in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
