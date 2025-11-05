const STORAGE_KEY = "simple_budget_data_v12";
const $ = (sel) => document.querySelector(sel);
const fmt = (n)=> (n ?? 0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});

let data = null;

function loadData(){ const raw=localStorage.getItem(STORAGE_KEY); if(raw){ try{return JSON.parse(raw);}catch{} } return INITIAL_DATA; }
function saveData(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

function monthNames(){ return Object.keys(data.months); }
function currentMonthName(){ return $("#monthSelect").value; }
function currentMonth(){ return data.months[currentMonthName()]; }
function useTransactions(){ return !!(data.settings?.useTransactions); }
function compactOn(){ return !!(data.settings?.compact); }

function daysInMonth(year, month){ return new Date(year, month+1, 0).getDate(); }
function advanceDateStrOneMonth(dateStr){
  if(!dateStr) return "";
  const parts = dateStr.split("-");
  if(parts.length !== 3) return dateStr;
  let y = parseInt(parts[0]), m = parseInt(parts[1])-1, d = parseInt(parts[2]);
  if(isNaN(y)||isNaN(m)||isNaN(d)) return dateStr;
  let ny = y, nm = m+1;
  if(nm > 11){ nm = 0; ny += 1; }
  const dim = daysInMonth(ny, nm);
  const nd = Math.min(d, dim);
  const mm = String(nm+1).padStart(2,"0");
  const dd = String(nd).padStart(2,"0");
  return `${ny}-${mm}-${dd}`;
}

function ensureMonth(name){
  if(!data.months[name]){
    const names = monthNames();
    if(names.length){
      const prev = data.months[names[names.length-1]];
      data.months[name] = {
        income: prev.income.map(i=>({name:i.name, planned:i.planned, actual:0})),
        incomeTransactions: [],
        expenseGroups: prev.expenseGroups.map(g=>({
          group:g.group, items: g.items.map(it=>({
            name:it.name,
            date: advanceDateStrOneMonth(it.date||""),
            planned:it.planned, actual:0
          }))
        })),
        debts: prev.debts.map(d=>({
          name:d.name,
          balance: (d.balance||0) + (calcInterest(d) || 0) - (d.actualPayment||0),
          apr: d.apr||0,
          autoInterest: !!d.autoInterest,
          interest: 0,
          plannedPayment: d.plannedPayment||0,
          actualPayment: 0,
          paidOn: d.paidOn ? advanceDateStrOneMonth(d.paidOn) : ""
        })),
        transactions: []
      };
    } else {
      data.months[name] = { income:[], incomeTransactions:[], expenseGroups:[], debts:[], transactions:[] };
    }
  }
}

function calcInterest(d){
  if(d?.autoInterest){
    const apr = parseFloat(d.apr||0)/100;
    return (d.balance||0) * (apr/12);
  }
  return d?.interest||0;
}

function setBodyCompactClasses(){
  document.body.classList.toggle("compact", compactOn());
  const auto = window.innerWidth <= 1000;
  document.body.classList.toggle("auto-compact", auto);
}

function renderMonthOptions(){
  const sel=$("#monthSelect"); sel.innerHTML="";
  for(const n of monthNames()){
    const o=document.createElement("option"); o.value=n; o.textContent=n; sel.appendChild(o);
  }
}

function recomputeExpenseActualsFromTx(){
  if(!useTransactions()) return;
  const m = currentMonth();
  for(const g of m.expenseGroups){ for(const it of g.items){ it.actual = 0; } }
  for(const t of m.transactions){
    const g = m.expenseGroups.find(x=>x.group===t.group);
    const it = g ? g.items.find(y=>y.name===t.item) : null;
    if(it){ it.actual = (it.actual||0) + (t.amount||0); }
  }
}

function recomputeIncomeActualsFromTx(){
  if(!useTransactions()) return;
  const m = currentMonth();
  for(const i of m.income){ i.actual = 0; }
  for(const t of m.incomeTransactions){
    const src = m.income.find(x=>x.name===t.source);
    if(src){ src.actual = (src.actual||0) + (t.amount||0); }
  }
}

function renderIncome(){
  const m=currentMonth();
  const body=document.querySelector("#incomeTable tbody");
  body.innerHTML="";
  let p=0,a=0;
  m.income.forEach((i,idx)=>{
    const tr=document.createElement("tr");
    const c1=document.createElement("td"); const n=document.createElement("input"); n.className="input"; n.value=i.name||""; n.onchange=()=>{i.name=n.value.trim(); refreshIncomeTxSources(); saveData();}; c1.appendChild(n);
    const c2=document.createElement("td"); const ip=document.createElement("input"); ip.className="input"; ip.type="number"; ip.step="0.01"; ip.value=i.planned??0; ip.onchange=()=>{i.planned=parseFloat(ip.value||"0"); saveData(); renderSummaryAndFooters();}; c2.appendChild(ip);
    const c3=document.createElement("td");
    if(useTransactions()){
      c3.textContent = fmt(i.actual||0); c3.className="num";
    } else {
      const ia=document.createElement("input"); ia.className="input"; ia.type="number"; ia.step="0.01"; ia.value=i.actual??0; ia.onchange=()=>{i.actual=parseFloat(ia.value||"0"); saveData(); renderSummaryAndFooters();}; c3.appendChild(ia);
    }
    const c4=document.createElement("td"); const del=document.createElement("button"); del.className="btn btn-ghost"; del.textContent="✕"; del.onclick=()=>{m.income.splice(idx,1); saveData(); renderAll();}; c4.appendChild(del);
    tr.appendChild(c1); tr.appendChild(c2); tr.appendChild(c3); tr.appendChild(c4);
    body.appendChild(tr);
    p += i.planned||0; a += i.actual||0;
  });
  $("#totIncomePlanned").textContent = fmt(p);
  $("#totIncomeActual").textContent = fmt(a);

  $("#incomeTxSection").style.display = useTransactions() ? "block" : "none";
  if(useTransactions()) refreshIncomeTxSources();
}

function renderIncomeTransactions(){
  if(!useTransactions()) return;
  const m=currentMonth();
  const body=document.querySelector("#incTxTable tbody"); body.innerHTML="";
  m.incomeTransactions.map((t,idx)=>({...t, idx})).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).forEach(t=>{
    const tr=document.createElement("tr");
    const c1=document.createElement("td"); c1.textContent=t.date||"";
    const c2=document.createElement("td"); c2.textContent=t.description||"";
    const c3=document.createElement("td"); c3.textContent=t.source||"";
    const c4=document.createElement("td"); c4.textContent=fmt(t.amount||0); c4.className="num";
    const c5=document.createElement("td"); const del=document.createElement("button"); del.className="btn btn-ghost"; del.textContent="✕"; del.onclick=()=>{ m.incomeTransactions.splice(t.idx,1); recomputeIncomeActualsFromTx(); saveData(); renderAll(); }; c5.appendChild(del);
    tr.appendChild(c1); tr.appendChild(c2); tr.appendChild(c3); tr.appendChild(c4); tr.appendChild(c5);
    body.appendChild(tr);
  });
}

function renderExpenses(){
  const m=currentMonth();
  const container = $("#expenseGroups");
  container.innerHTML="";
  let grandP=0, grandA=0;

  m.expenseGroups.forEach((g,gidx)=>{
    let gp=0, ga=0; g.items.forEach(it=>{ gp+=it.planned||0; ga+=it.actual||0; });

    const wrap=document.createElement("div"); wrap.className="expense-group";
    const head=document.createElement("header");

    const titleWrap=document.createElement("div"); titleWrap.className="group-title";
    const chev=document.createElement("div"); chev.className="chev"; chev.textContent="▾"; chev.title="Collapse/expand";
    const title=document.createElement("span"); title.textContent=g.group||"Header";
    titleWrap.appendChild(chev); titleWrap.appendChild(title);

    const controls=document.createElement("div"); controls.className="group-controls";
    const rn=document.createElement("input"); rn.className="input"; rn.value=g.group||""; rn.onchange=()=>{g.group=rn.value.trim(); saveData(); renderAll();}; rn.title="Rename header";
    const del=document.createElement("button"); del.className="btn btn-ghost"; del.textContent="Delete"; del.onclick=()=>{ m.expenseGroups.splice(gidx,1); saveData(); renderAll(); };
    controls.appendChild(rn); controls.appendChild(del);

    head.appendChild(titleWrap); head.appendChild(controls);
    wrap.appendChild(head);

    const tableWrap=document.createElement("div"); tableWrap.className="table-wrap";
    const tbl=document.createElement("table"); tbl.className="table";
    const thead=document.createElement("thead"); thead.innerHTML="<tr><th>Subcategory</th><th>Date</th><th>Planned</th><th>Actual</th><th>Remaining</th><th></th></tr>";
    const tbody=document.createElement("tbody");
    g.items.forEach((it,iidx)=>{
      const tr=document.createElement("tr");
      const c1=document.createElement("td"); const n=document.createElement("input"); n.className="input"; n.value=it.name||""; n.onchange=()=>{it.name=n.value.trim(); saveData(); renderAll();}; c1.appendChild(n);
      const cDate=document.createElement("td"); const d=document.createElement("input"); d.className="input"; d.type="date"; d.value=it.date||""; d.onchange=()=>{ it.date=d.value; saveData(); }; cDate.appendChild(d);
      const c2=document.createElement("td"); const ip=document.createElement("input"); ip.className="input"; ip.type="number"; ip.step="0.01"; ip.value=it.planned??0; ip.onchange=()=>{it.planned=parseFloat(ip.value||"0"); saveData(); renderAll();}; c2.appendChild(ip);
      const c3=document.createElement("td");
      if(useTransactions()){
        c3.textContent = fmt(it.actual||0); c3.className="num";
      } else {
        const ia=document.createElement("input"); ia.className="input"; ia.type="number"; ia.step="0.01"; ia.value=it.actual??0; ia.onchange=()=>{ it.actual=parseFloat(ia.value||"0"); saveData(); renderAll(); }; c3.appendChild(ia);
      }
      const c4=document.createElement("td"); c4.textContent=fmt((it.planned||0)-(it.actual||0)); c4.className="num";
      const c5=document.createElement("td"); const delbtn=document.createElement("button"); delbtn.className="btn btn-ghost"; delbtn.textContent="✕"; delbtn.onclick=()=>{ g.items.splice(iidx,1); saveData(); renderAll(); }; c5.appendChild(delbtn);
      tr.appendChild(c1); tr.appendChild(cDate); tr.appendChild(c2); tr.appendChild(c3); tr.appendChild(c4); tr.appendChild(c5);
      tbody.appendChild(tr);
    });
    const tfoot=document.createElement("tfoot");
    const tftr=document.createElement("tr"); tftr.className="totals";
    const tf1=document.createElement("td"); tf1.textContent="Subtotal";
    const tf2=document.createElement("td"); tf2.textContent="";
    const tf3=document.createElement("td"); tf3.textContent=fmt(gp);
    const tf4=document.createElement("td"); tf4.textContent=fmt(ga);
    const tf5=document.createElement("td"); tf5.textContent=fmt(gp-ga);
    const tf6=document.createElement("td"); tf6.textContent="";
    tftr.appendChild(tf1); tftr.appendChild(tf2); tftr.appendChild(tf3); tftr.appendChild(tf4); tftr.appendChild(tf5); tftr.appendChild(tf6);
    tfoot.appendChild(tftr);

    tbl.appendChild(thead); tbl.appendChild(tbody); tbl.appendChild(tfoot);
    tableWrap.appendChild(tbl);
    wrap.appendChild(tableWrap);

    const addRow=document.createElement("div"); addRow.className="inline row-add";
    const subName=document.createElement("input"); subName.className="input"; subName.placeholder="New subcategory";
    const subDate=document.createElement("input"); subDate.className="input"; subDate.type="date";
    const subPlan=document.createElement("input"); subPlan.className="input"; subPlan.type="number"; subPlan.step="0.01"; subPlan.placeholder="Planned";
    const addBtn=document.createElement("button"); addBtn.className="btn"; addBtn.textContent="Add Subcategory"; addBtn.onclick=()=>{
      const name=subName.value.trim(); const date=subDate.value; const p=parseFloat(subPlan.value||"0");
      if(!name) return;
      g.items.push({name, date, planned:p, actual:0});
      subName.value=""; subDate.value=""; subPlan.value="";
      saveData(); renderAll();
    };
    addRow.appendChild(subName); addRow.appendChild(subDate); addRow.appendChild(subPlan); addRow.appendChild(addBtn);
    wrap.appendChild(addRow);

    let collapsed=false;
    function setCollapsed(c){
      collapsed=c;
      tableWrap.style.display = collapsed ? "none" : "block";
      addRow.style.display = collapsed ? "none" : "flex";
      chev.textContent = collapsed ? "▸" : "▾";
    }
    chev.onclick = ()=> setCollapsed(!collapsed);
    setCollapsed(false);

    container.appendChild(wrap);

    grandP += gp; grandA += ga;
  });

  $("#totAllExpPlanned").textContent = fmt(grandP);
  $("#totAllExpActual").textContent = fmt(grandA);
  $("#totAllExpRemaining").textContent = fmt(grandP - grandA);

  $("#txSection").style.display = useTransactions() ? "block" : "none";
  if(useTransactions()) refreshTxSelectors();
}

function renderDebts(){
  const m=currentMonth();
  const body=document.querySelector("#debtTable tbody");
  body.innerHTML="";
  let balStart=0, interest=0, payP=0, payA=0, balEnd=0;
  m.debts.forEach((d,idx)=>{
    const liveInterest = d.autoInterest ? ( (d.balance||0) * ((parseFloat(d.apr||0)/100)/12) ) : (d.interest||0);

    const tr=document.createElement("tr");
    const c1=document.createElement("td"); const n=document.createElement("input"); n.className="input"; n.value=d.name||""; n.onchange=()=>{d.name=n.value.trim(); saveData(); }; c1.appendChild(n);
    const c2=document.createElement("td"); const b0=document.createElement("input"); b0.className="input"; b0.type="number"; b0.step="0.01"; b0.value=d.balance??0; b0.onchange=()=>{d.balance=parseFloat(b0.value||"0"); saveData(); renderAll();}; c2.appendChild(b0);
    const cAPR=document.createElement("td"); const apr=document.createElement("input"); apr.className="input"; apr.type="number"; apr.step="0.01"; apr.value=d.apr??0; apr.onchange=()=>{ d.apr=parseFloat(apr.value||"0"); saveData(); renderAll(); }; cAPR.appendChild(apr);
    const cAuto=document.createElement("td"); const chk=document.createElement("input"); chk.type="checkbox"; chk.checked=!!d.autoInterest; chk.onchange=()=>{ d.autoInterest=chk.checked; saveData(); renderAll(); }; cAuto.appendChild(chk);
    const cInt=document.createElement("td");
    if(d.autoInterest){
      cInt.textContent = fmt(liveInterest); cInt.className="num";
    } else {
      const inpt=document.createElement("input"); inpt.className="input"; inpt.type="number"; inpt.step="0.01"; inpt.value=d.interest??0; inpt.onchange=()=>{d.interest=parseFloat(inpt.value||"0"); saveData(); renderAll();}; cInt.appendChild(inpt);
    }
    const c3=document.createElement("td"); const pp=document.createElement("input"); pp.className="input"; pp.type="number"; pp.step="0.01"; pp.value=d.plannedPayment??0; pp.onchange=()=>{d.plannedPayment=parseFloat(pp.value||"0"); saveData(); renderSummaryAndFooters();}; c3.appendChild(pp);
    const c4=document.createElement("td"); const pa=document.createElement("input"); pa.className="input"; pa.type="number"; pa.step="0.01"; pa.value=d.actualPayment??0; pa.onchange=()=>{d.actualPayment=parseFloat(pa.value||"0"); saveData(); renderAll();}; c4.appendChild(pa);
    const cPaidOn=document.createElement("td"); const pdate=document.createElement("input"); pdate.className="input"; pdate.type="date"; pdate.value=d.paidOn||""; pdate.onchange=()=>{ d.paidOn=pdate.value; saveData(); }; cPaidOn.appendChild(pdate);
    const endBal = (d.balance||0) + liveInterest - (d.actualPayment||0);
    const c5=document.createElement("td"); c5.textContent = fmt(endBal); c5.className="num";
    const c6=document.createElement("td"); const del=document.createElement("button"); del.className="btn btn-ghost"; del.textContent="✕"; del.onclick=()=>{ m.debts.splice(idx,1); saveData(); renderAll(); }; c6.appendChild(del);

    tr.appendChild(c1); tr.appendChild(c2); tr.appendChild(cAPR); tr.appendChild(cAuto); tr.appendChild(cInt); tr.appendChild(c3); tr.appendChild(c4); tr.appendChild(cPaidOn); tr.appendChild(c5); tr.appendChild(c6);
    body.appendChild(tr);

    balStart += d.balance||0;
    interest += liveInterest||0;
    payP += d.plannedPayment||0;
    payA += d.actualPayment||0;
    balEnd += endBal;
  });
  $("#totDebtBalStart").textContent = fmt(balStart);
  $("#totDebtInterest").textContent = fmt(interest);
  $("#totDebtPlanned").textContent = fmt(payP);
  $("#totDebtActual").textContent = fmt(payA);
  $("#totDebtBalEnd").textContent = fmt(balEnd);
}

function renderExpenseTransactions(){
  if(!useTransactions()) return;
  const m=currentMonth();
  const body=document.querySelector("#txTable tbody"); body.innerHTML="";
  m.transactions.map((t,idx)=>({...t, idx})).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).forEach(t=>{
    const tr=document.createElement("tr");
    const c1=document.createElement("td"); c1.textContent=t.date||"";
    const c2=document.createElement("td"); c2.textContent=t.description||"";
    const c3=document.createElement("td"); c3.textContent=t.group||"";
    const c4=document.createElement("td"); c4.textContent=t.item||"";
    const c5=document.createElement("td"); c5.textContent=fmt(t.amount||0); c5.className="num";
    const c6=document.createElement("td"); const del=document.createElement("button"); del.className="btn btn-ghost"; del.textContent="✕"; del.onclick=()=>{ m.transactions.splice(t.idx,1); recomputeExpenseActualsFromTx(); saveData(); renderAll(); }; c6.appendChild(del);
    tr.appendChild(c1); tr.appendChild(c2); tr.appendChild(c3); tr.appendChild(c4); tr.appendChild(c5); tr.appendChild(c6);
    body.appendChild(tr);
  });
}

function renderSummaryAndFooters(){
  const m=currentMonth();
  const pInc = (m.income||[]).reduce((s,i)=>s+(i.planned||0),0);
  const aInc = (m.income||[]).reduce((s,i)=>s+(i.actual||0),0);
  $("#totIncomePlanned").textContent = fmt(pInc);
  $("#totIncomeActual").textContent = fmt(aInc);

  let pExp=0, aExp=0;
  for(const g of (m.expenseGroups||[])){ for(const it of g.items){ pExp += it.planned||0; aExp += it.actual||0; } }
  $("#totAllExpPlanned").textContent = fmt(pExp);
  $("#totAllExpActual").textContent = fmt(aExp);
  $("#totAllExpRemaining").textContent = fmt(pExp - aExp);

  let balStart=0, interest=0, payP=0, payA=0, balEnd=0;
  for(const d of (m.debts||[])){
    const liveInterest = d.autoInterest ? ( (d.balance||0) * ((parseFloat(d.apr||0)/100)/12) ) : (d.interest||0);
    balStart += d.balance||0; interest += liveInterest||0; payP += d.plannedPayment||0; payA += d.actualPayment||0;
    balEnd += (d.balance||0) + liveInterest - (d.actualPayment||0);
  }
  $("#totDebtBalStart").textContent = fmt(balStart);
  $("#totDebtInterest").textContent = fmt(interest);
  $("#totDebtPlanned").textContent = fmt(payP);
  $("#totDebtActual").textContent = fmt(payA);
  $("#totDebtBalEnd").textContent = fmt(balEnd);

  $("#sumPlannedIncome").textContent = fmt(pInc);
  $("#sumActualIncome").textContent = fmt(aInc);
  $("#sumPlannedExpenses").textContent = fmt(pExp);
  $("#sumActualExpenses").textContent = fmt(aExp);
  $("#sumPlannedDebt").textContent = fmt(payP);
  $("#sumActualDebt").textContent = fmt(payA);
  $("#sumPlannedNet").textContent = fmt(pInc - pExp - payP);
  $("#sumActualNet").textContent = fmt(aInc - aExp - payA);
}

function refreshTxSelectors(){
  const m=currentMonth();
  const gsel=$("#txGroup"); const isel=$("#txItem");
  gsel.innerHTML=""; isel.innerHTML="";
  (m.expenseGroups||[]).forEach(g=>{ const o=document.createElement("option"); o.value=g.group; o.textContent=g.group; gsel.appendChild(o); });
  function fillItems(){
    isel.innerHTML="";
    const g = (m.expenseGroups||[]).find(x=>x.group===gsel.value);
    (g?.items||[]).forEach(it=>{ const o=document.createElement("option"); o.value=it.name; o.textContent=it.name; isel.appendChild(o); });
  }
  gsel.onchange = fillItems;
  fillItems();
}

function renderAll(){
  if(useTransactions()){
    recomputeIncomeActualsFromTx();
    recomputeExpenseActualsFromTx();
  }
  renderIncome();
  renderIncomeTransactions();
  renderExpenses();
  renderDebts();
  renderExpenseTransactions();
  renderSummaryAndFooters();

  setBodyCompactClasses();
  $("#toggleCompact").checked = compactOn();
}

function addIncome(){
  const name=$("#newIncomeName").value.trim();
  const p=parseFloat($("#newIncomePlanned").value||"0");
  if(!name) return;
  currentMonth().income.push({name, planned:p, actual:0});
  $("#newIncomeName").value=""; $("#newIncomePlanned").value="";
  saveData(); renderAll();
}
function addIncomeTx(){
  const date=$("#incDate").value;
  const desc=$("#incDesc").value.trim();
  const amt=parseFloat($("#incAmount").value||"0");
  const src=$("#incSource").value;
  if(!src || !amt) return;
  currentMonth().incomeTransactions.push({date, description:desc, source:src, amount:amt});
  $("#incDesc").value=""; $("#incAmount").value="";
  saveData(); renderAll();
}
function addGroup(){
  const name=$("#newGroupName").value.trim();
  if(!name) return;
  currentMonth().expenseGroups.push({group:name, items:[]});
  $("#newGroupName").value="";
  saveData(); renderAll();
}
function addTx(){
  const date=$("#txDate").value;
  const desc=$("#txDesc").value.trim();
  const amt=parseFloat($("#txAmount").value||"0");
  const group=$("#txGroup").value;
  const item=$("#txItem").value;
  if(!group || !item || !amt) return;
  currentMonth().transactions.push({date, description:desc, group, item, amount:amt});
  $("#txDesc").value=""; $("#txAmount").value="";
  saveData(); renderAll();
}
function addDebt(){
  const name=$("#newDebtName").value.trim();
  const bal=parseFloat($("#newDebtBal").value||"0");
  const apr=parseFloat($("#newDebtAPR").value||"0");
  const plan=parseFloat($("#newDebtPlanned").value||"0");
  const paid=$("#newDebtPaidOn").value;
  if(!name) return;
  currentMonth().debts.push({name, balance:bal, apr:apr, autoInterest:true, interest:0, plannedPayment:plan, actualPayment:0, paidOn: paid});
  $("#newDebtName").value=""; $("#newDebtBal").value=""; $("#newDebtAPR").value=""; $("#newDebtPlanned").value=""; $("#newDebtPaidOn").value="";
  saveData(); renderAll();
}

function copyFromPrevious(){
  const names=monthNames();
  const idx=names.indexOf(currentMonthName());
  if(idx<=0){ alert("No previous month to copy from."); return; }
  const prev=data.months[names[idx-1]];
  const cur=currentMonth();
  cur.income = prev.income.map(i=>({name:i.name, planned:i.planned, actual:0}));
  cur.incomeTransactions = [];
  cur.expenseGroups = prev.expenseGroups.map(g=>({
    group:g.group,
    items:g.items.map(it=>({
      name:it.name,
      date: advanceDateStrOneMonth(it.date||""),
      planned:it.planned, actual:0
    }))
  }));
  cur.debts = prev.debts.map(d=>({
    name:d.name,
    balance:(d.balance||0) + (calcInterest(d) || 0) - (d.actualPayment||0),
    apr: d.apr||0,
    autoInterest: !!d.autoInterest,
    interest:0,
    plannedPayment:d.plannedPayment||0,
    actualPayment:0,
    paidOn: d.paidOn ? advanceDateStrOneMonth(d.paidOn) : ""
  }));
  cur.transactions = [];
  saveData(); renderAll();
}

function renameCurrentMonth(newName){
  const old=currentMonthName(); if(!newName || newName===old) return;
  data.months[newName] = data.months[old]; delete data.months[old];
  saveData(); renderMonthOptions(); $("#monthSelect").value = newName; renderAll();
}
function deleteCurrentMonth(){
  const name=currentMonthName();
  if(!confirm(`Delete month "${name}"?`)) return;
  delete data.months[name];
  if(!Object.keys(data.months).length){ data.months["New Month"]={income:[], incomeTransactions:[], expenseGroups:[], debts:[], transactions:[]}; }
  saveData(); renderMonthOptions(); $("#monthSelect").value = Object.keys(data.months)[0]; renderAll();
}

function refreshIncomeTxSources(){
  const m=currentMonth();
  const sel=$("#incSource"); sel.innerHTML="";
  (m.income||[]).forEach(i=>{ const o=document.createElement("option"); o.value=i.name; o.textContent=i.name; sel.appendChild(o); });
}

function deepNormalizeOnImport(obj){
  // Map dueDate->paidOn if paidOn missing; remove dueDate
  if(!obj || !obj.months) return obj;
  for(const mk of Object.keys(obj.months)){
    const m = obj.months[mk];
    if(Array.isArray(m.debts)){
      m.debts.forEach(d=>{
        if(d && d.dueDate && (!d.paidOn || d.paidOn==="")){
          d.paidOn = d.dueDate;
        }
        if(d && d.dueDate !== undefined){
          delete d.dueDate;
        }
      });
    }
  }
  return obj;
}

function init(){
  data = loadData();
  window.addEventListener("resize", setBodyCompactClasses);

  const sel=$("#monthSelect");
  sel.onchange = ()=> renderAll();

  const toggle=$("#toggleTx");
  toggle.checked = !!(data.settings?.useTransactions);
  toggle.onchange = ()=>{
    data.settings = data.settings || {};
    data.settings.useTransactions = toggle.checked;
    saveData(); renderAll();
  };

  const tCompact=$("#toggleCompact");
  tCompact.checked = compactOn();
  tCompact.onchange = ()=>{
    data.settings = data.settings || {};
    data.settings.compact = tCompact.checked;
    saveData(); setBodyCompactClasses();
  };

  document.querySelector("#newMonthBtn").onclick = ()=>{
    const name=prompt("Name of new month (e.g., December 2025):"); if(!name) return;
    ensureMonth(name); saveData(); renderMonthOptions(); $("#monthSelect").value=name; renderAll();
  };
  document.querySelector("#copyPrevBtn").onclick = copyFromPrevious;
  document.querySelector("#renameMonthBtn").onclick = ()=>{ const v=$("#monthNameInput").value.trim(); if(v) renameCurrentMonth(v); };
  document.querySelector("#deleteMonthBtn").onclick = deleteCurrentMonth;
  document.querySelector("#addIncomeBtn").onclick = addIncome;
  document.querySelector("#addIncTxBtn").onclick = addIncomeTx;
  document.querySelector("#addGroupBtn").onclick = addGroup;
  document.querySelector("#addTxBtn").onclick = addTx;
  document.querySelector("#addDebtBtn").onclick = addDebt;
  document.querySelector("#exportBtn").onclick = ()=>{
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="simple-budget-v2.12.json"; a.click(); URL.revokeObjectURL(url);
  };
  document.querySelector("#importFile").onchange = (e)=>{
    const f=e.target.files?.[0]; if(!f) return;
    const r=new FileReader(); r.onload=(ev)=>{
      try{
        let obj=JSON.parse(ev.target.result);
        obj = deepNormalizeOnImport(obj);
        if(obj && obj.months){ data=obj; saveData(); renderMonthOptions(); $("#monthSelect").value=Object.keys(data.months)[0]; renderAll(); }
        else alert("Invalid file.");
      } catch { alert("Invalid JSON."); }
    }; r.readAsText(f);
  };

  renderMonthOptions();
  $("#monthSelect").value = Object.keys(data.months)[0];
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);

const INITIAL_DATA = {
  "version": 12,
  "currency": "USD",
  "settings": {
    "useTransactions": false,
    "compact": true
  },
  "months": {
    "November 2025": {
      "income": [
        {
          "name": "Paycheck 1",
          "planned": 0.0,
          "actual": 0.0
        }
      ],
      "incomeTransactions": [],
      "expenseGroups": [
        {
          "group": "Housing",
          "items": [
            {
              "name": "Mortgage/Rent",
              "date": "",
              "planned": 0.0,
              "actual": 0.0
            },
            {
              "name": "Utilities",
              "date": "",
              "planned": 0.0,
              "actual": 0.0
            }
          ]
        },
        {
          "group": "Transportation",
          "items": [
            {
              "name": "Fuel",
              "date": "",
              "planned": 0.0,
              "actual": 0.0
            },
            {
              "name": "Insurance",
              "date": "",
              "planned": 0.0,
              "actual": 0.0
            }
          ]
        }
      ],
      "debts": [
        {
          "name": "Car Loan",
          "balance": 0.0,
          "apr": 0.0,
          "autoInterest": true,
          "interest": 0.0,
          "plannedPayment": 0.0,
          "actualPayment": 0.0,
          "paidOn": ""
        }
      ],
      "transactions": []
    }
  }
};

// === v2.13: New Blank Template Month ===
// Creates a month with standard grouped categories and blank dates
function createTemplateMonth() {
  const name = prompt("Name for new template month (e.g., Test Scenario A):");
  if(!name) return;
  if(data.months[name]){
    if(!confirm("A month with this name already exists. Replace it?")) return;
  }
  const template = {
    income: [],
    incomeTransactions: [],
    expenseGroups: [
      { group: "Housing", items: [
        { name: "Rent/Mortgage", date: "", planned: 0, actual: 0 },
        { name: "Utilities", date: "", planned: 0, actual: 0 },
        { name: "HOA Fees", date: "", planned: 0, actual: 0 }
      ]},
      { group: "Transportation", items: [
        { name: "Fuel", date: "", planned: 0, actual: 0 },
        { name: "Insurance", date: "", planned: 0, actual: 0 }
      ]},
      { group: "Fixed Recurring Costs", items: [
        { name: "Internet", date: "", planned: 0, actual: 0 },
        { name: "Phone", date: "", planned: 0, actual: 0 },
        { name: "Streaming Services", date: "", planned: 0, actual: 0 }
      ]},
      { group: "Allowance", items: [
        { name: "Dining Out", date: "", planned: 0, actual: 0 },
        { name: "Personal", date: "", planned: 0, actual: 0 }
      ]},
      { group: "Savings", items: [
        { name: "Emergency Fund", date: "", planned: 0, actual: 0 },
        { name: "Investments", date: "", planned: 0, actual: 0 }
      ]}
    ],
    debts: [],
    transactions: []
  };
  data.months[name] = template;
  saveData();
  // re-render month list & select the new one
  const sel = document.querySelector("#monthSelect");
  const opt = document.createElement("option"); opt.value = name; opt.textContent = name;
  sel.appendChild(opt);
  sel.value = name;
  if(typeof renderAll === "function"){ renderAll(); }
}

// Wire up button after DOMContentLoaded (append to existing handlers)
document.addEventListener("DOMContentLoaded", function(){
  const btn = document.querySelector("#newTemplateBtn");
  if(btn){ btn.addEventListener("click", createTemplateMonth); }
});


// === v2.14: New Month flow with explicit source month selection ===

// Parse "Month YYYY" into a comparable number (YYYY*12+MM). Returns null if not parseable.
function parseMonthNameToIndex(name){
  if(!name) return null;
  const m = name.match(/^\s*([A-Za-z]+)\s+(\d{4})\s*$/);
  if(!m) return null;
  const monthNames = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const mi = monthNames.indexOf(m[1].toLowerCase());
  if(mi < 0) return null;
  const year = parseInt(m[2],10);
  return year*12 + mi;
}

function bestPreviousMonthFor(targetMonthName){
  // pick the chronologically latest month that is <= the target - 1 month
  const targetIdx = parseMonthNameToIndex(targetMonthName);
  let best = null, bestIdx = -1;
  for(const n of Object.keys(data.months)){
    const idx = parseMonthNameToIndex(n);
    if(idx === null) continue;
    if(targetIdx !== null){
      if(idx < targetIdx && idx > bestIdx){ best = n; bestIdx = idx; }
    } else {
      // if target unparsable, fall back to latest by idx
      if(idx > bestIdx){ best = n; bestIdx = idx; }
    }
  }
  // fallback: if none older, choose the latest by idx
  if(!best){
    for(const n of Object.keys(data.months)){
      const idx = parseMonthNameToIndex(n);
      if(idx !== null && idx > bestIdx){ best = n; bestIdx = idx; }
    }
  }
  return best;
}

// Build new month from a chosen source month, rolling dates +1 month from the source month only.
function buildMonthFromSource(sourceName){
  const prev = data.months[sourceName];
  if(!prev){ return { income:[], incomeTransactions:[], expenseGroups:[], debts:[], transactions:[] }; }
  const res = {
    income: (prev.income||[]).map(i=>({name:i.name, planned:i.planned, actual:0})),
    incomeTransactions: [],
    expenseGroups: (prev.expenseGroups||[]).map(g=>({
      group:g.group,
      items:(g.items||[]).map(it=>({
        name:it.name,
        date: advanceDateStrOneMonth(it.date||""),
        planned: it.planned||0,
        actual: 0
      }))
    })),
    debts: (prev.debts||[]).map(d=>({
      name:d.name,
      balance:(d.balance||0) + (calcInterest(d) || 0) - (d.actualPayment||0),
      apr: d.apr||0,
      autoInterest: !!d.autoInterest,
      interest:0,
      plannedPayment:d.plannedPayment||0,
      actualPayment:0,
      paidOn: d.paidOn ? advanceDateStrOneMonth(d.paidOn) : ""
    })),
    transactions: []
  };
  return res;
}

// Replace New Month button behavior
(function(){
  const btn = document.querySelector("#newMonthBtn");
  if(btn){
    btn.onclick = function(){
      const newName = prompt("Name of new month (e.g., December 2025):");
      if(!newName) return;
      // Suggest a source month explicitly (default to best chronological previous month)
      const defaultSrc = bestPreviousMonthFor(newName);
      let src = prompt("Copy amounts & roll dates based on which month?\n(Leave as default if unsure)", defaultSrc || "");
      if(!src || !data.months[src]){
        // If the user typed an unknown month, fall back to default
        src = defaultSrc;
      }
      if(!src){
        alert("No valid source month found; creating a blank month. You can use 'Copy Prev → Current' later if needed.");
        data.months[newName] = { income:[], incomeTransactions:[], expenseGroups:[], debts:[], transactions:[] };
      } else {
        data.months[newName] = buildMonthFromSource(src);
      }
      saveData();
      // refresh month list and select the new one
      const sel = document.querySelector("#monthSelect");
      const opt = document.createElement("option"); opt.value=newName; opt.textContent=newName; sel.appendChild(opt); sel.value = newName;
      if(typeof renderAll==="function"){ renderAll(); }
    };
  }
})();


// === v2.15: New Month modal with dropdown source ===
function fillSourceMonthSelect(selectEl){
  selectEl.innerHTML = "";
  // sort months chronologically
  const entries = Object.keys(data.months).map(n=>({name:n, idx: parseMonthNameToIndex(n)}))
    .filter(x=>x.idx!==null).sort((a,b)=>a.idx-b.idx);
  for(const e of entries){
    const o = document.createElement("option");
    o.value = e.name; o.textContent = e.name;
    selectEl.appendChild(o);
  }
  // If none parseable, just list unsorted
  if(selectEl.options.length===0){
    for(const n of Object.keys(data.months)){
      const o=document.createElement("option"); o.value=n; o.textContent=n; selectEl.appendChild(o);
    }
  }
}

(function(){
  const btn = document.querySelector("#newMonthBtn");
  if(btn){
    btn.onclick = function(){
      const modal = document.querySelector("#newMonthModal");
      const nameField = document.querySelector("#newMonthNameField");
      const srcSel = document.querySelector("#sourceMonthSelect");
      const createBtn = document.querySelector("#newMonthCreateBtn");
      const cancelBtn = document.querySelector("#newMonthCancelBtn");

      fillSourceMonthSelect(srcSel);
      // Preselect the latest month by index
      if(srcSel.options.length>0){
        srcSel.selectedIndex = srcSel.options.length-1;
      }

      modal.style.display = "block";

      function close(){ modal.style.display="none"; createBtn.onclick=null; cancelBtn.onclick=null; }

      cancelBtn.onclick = close;

      createBtn.onclick = function(){
        const newName = (nameField.value||"").trim();
        if(!newName){ alert("Please enter a name for the new month (e.g., December 2025)."); return; }
        let src = srcSel.value;
        // If user left it empty somehow, pick the best previous for the typed name
        if(!src){ src = bestPreviousMonthFor(newName); }
        if(!src){
          // create totally blank if no valid source
          data.months[newName] = { income:[], incomeTransactions:[], expenseGroups:[], debts:[], transactions:[] };
        } else {
          data.months[newName] = buildMonthFromSource(src);
        }
        saveData();
        const sel = document.querySelector("#monthSelect");
        const opt = document.createElement("option"); opt.value=newName; opt.textContent=newName; sel.appendChild(opt); sel.value=newName;
        if(typeof renderAll==="function"){ renderAll(); }
        close();
      };
    };
  }
})();


// === v2.15.1: Force New Month modal with dropdown ===
function parseMonthNameToIndex(name){
  if(!name) return null;
  const m = name.match(/^\s*([A-Za-z]+)\s+(\d{4})\s*$/);
  if(!m) return null;
  const monthNames = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const mi = monthNames.indexOf(m[1].toLowerCase());
  if(mi < 0) return null;
  const year = parseInt(m[2],10);
  return year*12 + mi;
}
function bestPreviousMonthFor(targetMonthName){
  const targetIdx = parseMonthNameToIndex(targetMonthName);
  let best = null, bestIdx = -1;
  for(const n of Object.keys(data.months)){
    const idx = parseMonthNameToIndex(n);
    if(idx === null) continue;
    if(targetIdx !== null){
      if(idx < targetIdx && idx > bestIdx){ best = n; bestIdx = idx; }
    } else {
      if(idx > bestIdx){ best = n; bestIdx = idx; }
    }
  }
  if(!best){
    for(const n of Object.keys(data.months)){
      const idx = parseMonthNameToIndex(n);
      if(idx !== null && idx > bestIdx){ best = n; bestIdx = idx; }
    }
  }
  return best;
}
function buildMonthFromSource(sourceName){
  const prev = data.months[sourceName];
  if(!prev){ return { income:[], incomeTransactions:[], expenseGroups:[], debts:[], transactions:[] }; }
  const res = {
    income: (prev.income||[]).map(i=>({name:i.name, planned:i.planned, actual:0})),
    incomeTransactions: [],
    expenseGroups: (prev.expenseGroups||[]).map(g=>({
      group:g.group,
      items:(g.items||[]).map(it=>({
        name:it.name,
        date: advanceDateStrOneMonth(it.date||""),
        planned: it.planned||0,
        actual: 0
      }))
    })),
    debts: (prev.debts||[]).map(d=>({
      name:d.name,
      balance:(d.balance||0) + (calcInterest(d) || 0) - (d.actualPayment||0),
      apr: d.apr||0,
      autoInterest: !!d.autoInterest,
      interest:0,
      plannedPayment:d.plannedPayment||0,
      actualPayment:0,
      paidOn: d.paidOn ? advanceDateStrOneMonth(d.paidOn) : ""
    })),
    transactions: []
  };
  return res;
}
function fillSourceMonthSelect(selectEl){
  selectEl.innerHTML = "";
  const entries = Object.keys(data.months).map(n=>({name:n, idx: parseMonthNameToIndex(n)}))
    .filter(x=>x.idx!==null).sort((a,b)=>a.idx-b.idx);
  for(const e of entries){
    const o = document.createElement("option");
    o.value = e.name; o.textContent = e.name;
    selectEl.appendChild(o);
  }
  if(selectEl.options.length===0){
    for(const n of Object.keys(data.months)){
      const o=document.createElement("option"); o.value=n; o.textContent=n; selectEl.appendChild(o);
    }
  }
}
document.addEventListener("DOMContentLoaded", function(){
  const btn = document.querySelector("#newMonthBtn");
  if(!btn) return;
  // Remove any previous onclick to avoid conflicts
  btn.onclick = null;
  btn.addEventListener("click", function(ev){
    ev.preventDefault();
    const modal = document.querySelector("#newMonthModal");
    const nameField = document.querySelector("#newMonthNameField");
    const srcSel = document.querySelector("#sourceMonthSelect");
    const createBtn = document.querySelector("#newMonthCreateBtn");
    const cancelBtn = document.querySelector("#newMonthCancelBtn");
    if(!modal){ alert("Modal not found. Please re-download the latest zip."); return; }
    fillSourceMonthSelect(srcSel);
    if(srcSel.options.length>0){ srcSel.selectedIndex = srcSel.options.length-1; }
    modal.style.display = "block";
    function close(){ modal.style.display="none"; createBtn.onclick=null; cancelBtn.onclick=null; }
    cancelBtn.onclick = close;
    createBtn.onclick = function(){
      const newName = (nameField.value||"").trim();
      if(!newName){ alert("Please enter a name for the new month (e.g., December 2025)."); return; }
      let src = srcSel.value;
      if(!src){ src = bestPreviousMonthFor(newName); }
      if(!src){
        data.months[newName] = { income:[], incomeTransactions:[], expenseGroups:[], debts:[], transactions:[] };
      } else {
        data.months[newName] = buildMonthFromSource(src);
      }
      saveData();
      const sel = document.querySelector("#monthSelect");
      const opt = document.createElement("option"); opt.value=newName; opt.textContent=newName; sel.appendChild(opt); sel.value=newName;
      if(typeof renderAll==="function"){ renderAll(); }
      close();
    };
  }, {passive:false});
});


// === v2.16: Smart default + Remember last source ===
function monthMinusOne(name){
  // returns string of previous calendar month (e.g., "December 2025" -> "November 2025"), or null
  const m = name && name.match(/^\s*([A-Za-z]+)\s+(\d{4})\s*$/);
  if(!m) return null;
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const idx = months.findIndex(x=>x.toLowerCase()===m[1].toLowerCase());
  if(idx<0) return null;
  let y = parseInt(m[2],10);
  let mi = idx - 1;
  if(mi < 0){ mi = 11; y -= 1; }
  return months[mi] + " " + y;
}

// Ensure settings object and defaults
function ensureSettings(){
  data.settings = data.settings || {};
  if(typeof data.settings.compact === "undefined") data.settings.compact = true;
  if(typeof data.settings.useTransactions === "undefined") data.settings.useTransactions = false;
  if(typeof data.settings.rememberSource === "undefined") data.settings.rememberSource = false;
  if(typeof data.settings.lastSourceMonth === "undefined") data.settings.lastSourceMonth = "";
}

document.addEventListener("DOMContentLoaded", function(){
  ensureSettings();
  // Hook modal open to apply defaults and persistence
  const btn = document.querySelector("#newMonthBtn");
  const modal = document.querySelector("#newMonthModal");
  if(!btn || !modal) return;
  const nameField = document.querySelector("#newMonthNameField");
  const srcSel = document.querySelector("#sourceMonthSelect");
  const createBtn = document.querySelector("#newMonthCreateBtn");
  const cancelBtn = document.querySelector("#newMonthCancelBtn");
  const rememberChk = document.querySelector("#rememberSourceChk");

  // Fill select helper (re-use from 2.15.1 if present)
  function fillSourceMonthSelect(selectEl){
    selectEl.innerHTML = "";
    const entries = Object.keys(data.months).map(n=>({name:n, idx: parseMonthNameToIndex(n)}))
      .filter(x=>x.idx!==null).sort((a,b)=>a.idx-b.idx);
    for(const e of entries){
      const o = document.createElement("option");
      o.value = e.name; o.textContent = e.name;
      selectEl.appendChild(o);
    }
    if(selectEl.options.length===0){
      for(const n of Object.keys(data.months)){
        const o=document.createElement("option"); o.value=n; o.textContent=n; selectEl.appendChild(o);
      }
    }
  }

  // Override button behavior
  btn.onclick = function(){
    fillSourceMonthSelect(srcSel);
    // set remember checkbox from settings
    rememberChk.checked = !!data.settings.rememberSource;
    // default selection priority:
    // 1) If typed name parses (live as user types), try previous month of that name
    // 2) Else if rememberSource and lastSourceMonth exists in list -> select it
    // 3) Else select latest in list
    function applyDefaultSelection(){
      const typed = (nameField.value||"").trim();
      const prevFromTyped = monthMinusOne(typed);
      let selectedIndex = -1;

      if(prevFromTyped){
        for(let i=0;i<srcSel.options.length;i++){
          if(srcSel.options[i].value === prevFromTyped){ selectedIndex = i; break; }
        }
      }
      if(selectedIndex === -1 && data.settings.rememberSource && data.settings.lastSourceMonth){
        for(let i=0;i<srcSel.options.length;i++){
          if(srcSel.options[i].value === data.settings.lastSourceMonth){ selectedIndex = i; break; }
        }
      }
      if(selectedIndex === -1 && srcSel.options.length>0){
        selectedIndex = srcSel.options.length-1;
      }
      if(selectedIndex >= 0){ srcSel.selectedIndex = selectedIndex; }
    }

    // apply once when opening
    applyDefaultSelection();
    // and re-apply whenever name changes (live inference)
    nameField.oninput = applyDefaultSelection;

    modal.style.display = "block";

    function close(){ modal.style.display="none"; createBtn.onclick=null; cancelBtn.onclick=null; nameField.oninput=null; }

    cancelBtn.onclick = close;
    createBtn.onclick = function(){
      const newName = (nameField.value||"").trim();
      if(!newName){ alert("Please enter a name for the new month (e.g., December 2025)."); return; }
      let src = srcSel.value;
      if(!src){ src = bestPreviousMonthFor(newName); }
      if(!src){
        data.months[newName] = { income:[], incomeTransactions:[], expenseGroups:[], debts:[], transactions:[] };
      } else {
        data.months[newName] = buildMonthFromSource(src);
      }
      // persist preference if asked
      data.settings.rememberSource = !!rememberChk.checked;
      if(data.settings.rememberSource){ data.settings.lastSourceMonth = src || ""; }
      saveData();
      const sel = document.querySelector("#monthSelect");
      const opt = document.createElement("option"); opt.value=newName; opt.textContent=newName; sel.appendChild(opt); sel.value=newName;
      if(typeof renderAll==="function"){ renderAll(); }
      close();
    };
  };
});


// v2.17.2: Backup Now button (timestamped JSON download)
(function(){
  function tsName(){
    const d = new Date();
    const pad = (n)=>String(n).padStart(2,"0");
    return `simple-budget-backup-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
  }
  document.addEventListener("DOMContentLoaded", function(){
    const btn = document.getElementById("backupBtn");
    if(!btn) return;
    btn.addEventListener("click", function(){
      try{
        const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = tsName();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e){
        alert("Backup failed: " + (e && e.message ? e.message : e));
      }
    });
  });
})();


// v2.17.2 mobile enhancements (numeric keypad & auto-compact)
(function(){
  function isNarrow(){ return window.innerWidth <= 680; }
  function tweakNumberInputs(){
    document.querySelectorAll('input[type="number"]').forEach(inp=>{
      inp.setAttribute('inputmode','decimal');
      inp.setAttribute('pattern','[0-9]*');
    });
  }
  window.addEventListener('resize', ()=>{
    document.body.classList.toggle('auto-compact', isNarrow());
  });
  document.addEventListener('DOMContentLoaded', ()=>{
    document.body.classList.toggle('auto-compact', isNarrow());
    tweakNumberInputs();
  });
})();
