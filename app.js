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

const $ = id => document.getElementById(id);

async function init() {
  try {
    SQL = await initSqlJs({
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/${file}`
    });
    $("dbFile").addEventListener("change", e => loadFile(e.target.files[0]));
    $("dbFileWelcome").addEventListener("change", e => loadFile(e.target.files[0]));
    $("search").addEventListener("input", debounce(applyFilter, 150));
    $("searchColumn").addEventListener("change", applyFilter);
    $("caseSensitive").addEventListener("change", applyFilter);
    $("clearSearch").addEventListener("click", () => { $("search").value=""; applyFilter(); });
    $("prevPage").addEventListener("click", () => { if(page>1){page--;renderTable();}});
    $("nextPage").addEventListener("click", () => { if(page<Math.ceil(filteredRows.length/PAGE_SIZE)){page++;renderTable();}});
    $("exportBtn").addEventListener("click", exportResults);
    $("refreshBtn").addEventListener("click", () => currentTable && openTable(currentTable));
    $("advancedToggle").addEventListener("click", () => {
      $("advancedBody").classList.toggle("hidden");
      $("advancedToggle").textContent = $("advancedBody").classList.contains("hidden") ? "▸ Consulta SQL avanzada" : "▾ Consulta SQL avanzada";
    });
    $("runSql").addEventListener("click", runSQL);
  } catch(e) {
    toast("No se pudo cargar el motor SQLite: " + e.message);
  }
}
async function loadFile(file) {
  if (!file) return;
  try {
    toast("Cargando " + file.name + "…");
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength < 16) throw new Error("El archivo está vacío o es demasiado pequeño.");
    db = new SQL.Database(new Uint8Array(buffer));
    dbFileName = file.name;
    $("dbName").textContent = file.name;
    $("welcome").classList.add("hidden");
    $("app").classList.remove("hidden");
    loadTables();
    toast("Base de datos cargada correctamente.");
  } catch(e) {
    db = null;
    toast("No se pudo abrir el archivo: " + e.message);
  }
}
function loadTables() {
  const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const names = result.length ? result[0].values.map(r=>r[0]) : [];
  $("tableCount").textContent = names.length;
  $("tables").innerHTML = names.length ? "" : '<div class="empty">No hay tablas de usuario.</div>';
  names.forEach(name => {
    const b = document.createElement("button");
    b.className = "table-item";
    b.innerHTML = `<span>${escapeHtml(name)}</span><small>${getCount(name).toLocaleString("es-ES")}</small>`;
    b.addEventListener("click", () => openTable(name));
    b.dataset.table = name;
    $("tables").appendChild(b);
  });
  if (names.length) openTable(names[0]);
}
function getCount(name) {
  try { return db.exec(`SELECT COUNT(*) FROM ${quoteId(name)}`)[0].values[0][0] || 0; } catch { return 0; }
}
function openTable(name) {
  currentTable = name; sqlMode = false;
  document.querySelectorAll(".table-item").forEach(b=>b.classList.toggle("active", b.dataset.table===name));
  $("currentTable").textContent = name;
  $("search").value = "";
  $("searchColumn").innerHTML = '<option value="__all__">Todas las columnas</option>';
  const info = db.exec(`PRAGMA table_info(${quoteId(name)})`);
  columns = info.length ? info[0].values.map(r=>r[1]) : [];
  columns.forEach(c => $("searchColumn").insertAdjacentHTML("beforeend", `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`));
  $("columnCount").textContent = columns.length;
  const res = db.exec(`SELECT * FROM ${quoteId(name)}`);
  allRows = res.length ? res[0].values : [];
  filteredRows = allRows.slice(); page = 1;
  $("rowCount").textContent = allRows.length.toLocaleString("es-ES");
  renderTable();
}
function applyFilter() {
  if (!columns.length) return;
  const term = $("search").value;
  const col = $("searchColumn").value;
  const sensitive = $("caseSensitive").checked;
  const needle = sensitive ? term : term.toLocaleLowerCase();
  filteredRows = !term ? allRows.slice() : allRows.filter(row => {
    const vals = col === "__all__" ? row : [row[columns.indexOf(col)]];
    return vals.some(v => {
      if (v === null || v === undefined) return false;
      const s = String(v);
      return (sensitive ? s : s.toLocaleLowerCase()).includes(needle);
    });
  });
  page=1; renderTable();
}
function renderTable() {
  const start=(page-1)*PAGE_SIZE, end=Math.min(start+PAGE_SIZE, filteredRows.length);
  const shown=filteredRows.slice(start,end);
  $("resultInfo").textContent = `${filteredRows.length.toLocaleString("es-ES")} resultados`;
  const pages=Math.max(1,Math.ceil(filteredRows.length/PAGE_SIZE));
  $("pageInfo").textContent = `página ${page} / ${pages}`;
  $("pageNumber").textContent = page;
  $("prevPage").disabled = page<=1; $("nextPage").disabled=page>=pages;
  if (!columns.length) { $("tableWrap").innerHTML='<div class="empty">La consulta no devuelve columnas.</div>'; return; }
  let html='<table class="data-table"><thead><tr>';
  columns.forEach(c=>html+=`<th>${escapeHtml(c)}</th>`);
  html+='</tr></thead><tbody>';
  shown.forEach(row=>{
    html+='<tr>';
    row.forEach(v=>html+=`<td title="${escapeAttr(formatValue(v))}">${v===null?'<span class="null">NULL</span>':escapeHtml(formatValue(v))}</td>`);
    html+='</tr>';
  });
  html+='</tbody></table>';
  $("tableWrap").innerHTML=html;
}
function runSQL() {
  const q=$("sqlInput").value.trim();
  if(!q) return toast("Escribe una consulta.");
  if(!/^(SELECT|WITH|PRAGMA)\b/i.test(q)) return toast("Por seguridad, solo se permiten SELECT, WITH y PRAGMA.");
  try {
    const res=db.exec(q);
    if(!res.length) { $("tableWrap").innerHTML='<div class="empty">La consulta no devuelve filas.</div>'; return; }
    columns=res[0].columns; allRows=res[0].values; filteredRows=allRows.slice(); page=1;
    sqlMode=true; currentTable=null;
    $("currentTable").textContent="Resultado SQL";
    $("columnCount").textContent=columns.length; $("rowCount").textContent=allRows.length.toLocaleString("es-ES");
    $("search").value="";
    $("searchColumn").innerHTML='<option value="__all__">Todas las columnas</option>';
    columns.forEach(c=>$("searchColumn").insertAdjacentHTML("beforeend",`<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`));
    renderTable(); toast("Consulta ejecutada.");
  } catch(e) { toast("SQL: "+e.message); }
}
function exportResults() {
  if (!columns.length) return toast("No hay datos para exportar.");
  try {
    const data=[columns,...filteredRows];
    const ws=XLSX.utils.aoa_to_sheet(data);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Resultados");
    const base=(dbFileName||"database").replace(/\.[^.]+$/,"");
    const suffix=sqlMode?"consulta":(currentTable||"resultados");
    XLSX.writeFile(wb,`${base}_${suffix}.xlsx`);
    toast("Excel generado. Numbers puede abrir este .xlsx.");
  } catch(e) { toast("No se pudo exportar: "+e.message); }
}
function quoteId(s){return '"'+String(s).replaceAll('"','""')+'"'}
function formatValue(v){ if(v instanceof Uint8Array)return `[BLOB ${v.byteLength} bytes]`; return String(v); }
function escapeHtml(s){return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function escapeAttr(s){return escapeHtml(s)}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}
let toastTimer;
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2800)}
init();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(()=>{});
