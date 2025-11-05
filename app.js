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


// v2.18: Mobile card renderers for Expenses & Debts
(function(){
  function fmt(n){ if(n===undefined||n===null||n==='') return '0.00'; var v=Number(n)||0; return v.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}); }
  function ensureCurrentMonth(){
    try{
      const sel = document.getElementById('monthSelect');
      return sel && sel.value && data.months ? data.months[sel.value] : null;
    }catch(e){ return null; }
  }
  function renderExpenseCards(){
    const cont = document.getElementById('expenseCards');
    if(!cont) return;
    cont.innerHTML = '';
    const m = ensureCurrentMonth();
    if(!m || !Array.isArray(m.expenseGroups)) return;
    m.expenseGroups.forEach(g=>{
      const group = document.createElement('div');
      group.className = 'card-group';
      const gt = document.createElement('div');
      gt.className = 'group-title'; gt.textContent = g.group || 'Group';
      group.appendChild(gt);
      (g.items||[]).forEach(it=>{
        const c = document.createElement('div');
        c.className = 'card-item';
        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = it.name || 'Item';
        c.appendChild(title);

        const row1 = document.createElement('div'); row1.className='card-row';
        row1.innerHTML = '<span class="label">Planned</span><span class="value">$'+fmt(it.planned)+'</span>';
        const row2 = document.createElement('div'); row2.className='card-row';
        row2.innerHTML = '<span class="label">Actual</span><span class="value">$'+fmt(it.actual)+'</span>';
        const row3 = document.createElement('div'); row3.className='card-row';
        row3.innerHTML = '<span class="label">Date</span><span class="value">'+(it.date||'—')+'</span>';

        c.appendChild(row1); c.appendChild(row2); c.appendChild(row3);
        group.appendChild(c);
      });
      cont.appendChild(group);
    });
  }
  function renderDebtCards(){
    const cont = document.getElementById('debtCards');
    if(!cont) return;
    cont.innerHTML = '';
    const m = ensureCurrentMonth();
    if(!m || !Array.isArray(m.debts)) return;
    (m.debts||[]).forEach(d=>{
      const c = document.createElement('div');
      c.className = 'card-item';
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = d.name || 'Debt';
      c.appendChild(title);

      const rowBal = document.createElement('div'); rowBal.className='card-row';
      rowBal.innerHTML = '<span class="label">Balance</span><span class="value">$'+fmt(d.balance)+'</span>';
      const rowPl = document.createElement('div'); rowPl.className='card-row';
      rowPl.innerHTML = '<span class="label">Planned</span><span class="value">$'+fmt(d.plannedPayment)+'</span>';
      const rowAc = document.createElement('div'); rowAc.className='card-row';
      rowAc.innerHTML = '<span class="label">Actual</span><span class="value">$'+fmt(d.actualPayment)+'</span>';
      const rowDt = document.createElement('div'); rowDt.className='card-row';
      rowDt.innerHTML = '<span class="label">Paid On</span><span class="value">'+(d.paidOn||'—')+'</span>';

      c.appendChild(rowBal); c.appendChild(rowPl); c.appendChild(rowAc); c.appendChild(rowDt);
      cont.appendChild(c);
    });
  }
  function renderMobileCards(){ renderExpenseCards(); renderDebtCards(); }
  // Hook into existing renderAll
  (function(){
    const old = window.renderAll;
    window.renderAll = function(){ if(typeof old==='function') old(); renderMobileCards(); };
  })();
  // Also render on load and on month change
  document.addEventListener('DOMContentLoaded', renderMobileCards);
  document.addEventListener('change', function(e){
    if(e.target && e.target.id==='monthSelect'){ renderMobileCards(); }
  });
  window.addEventListener('resize', function(){ 
    // re-render because visibility toggles when crossing breakpoint
    renderMobileCards();
  });
})();


// v2.19: More menu toggle (Option B toolbar)
document.addEventListener('DOMContentLoaded', ()=>{
  const moreBtn = document.getElementById('moreBtn');
  const menu = document.getElementById('moreMenu');
  if(!moreBtn || !menu) return;
  function close(){ menu.style.display='none'; document.removeEventListener('click', onDoc); }
  function onDoc(e){ if(!menu.contains(e.target) && e.target!==moreBtn) close(); }
  moreBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const open = menu.style.display==='block';
    menu.style.display = open ? 'none' : 'block';
    if(!open){ setTimeout(()=>document.addEventListener('click', onDoc),0); }
  });
});


// v2.20: Editable mobile cards + visible Interest
(function(){
  function fmt(n){ if(n===undefined||n===null||n==='') return '0.00'; var v=Number(n)||0; return v.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}); }
  function currentMonth(){
    const sel = document.getElementById('monthSelect');
    return sel && sel.value && data.months ? data.months[sel.value] : null;
  }
  function createEditableValue(initial, type, onCommit, placeholder){
    const wrap = document.createElement('span');
    wrap.className = 'value editable';
    const input = document.createElement('input');
    input.type = (type==='date') ? 'text' : 'number';
    if(type==='date'){ input.placeholder = placeholder || 'MMM D, YYYY'; }
    input.value = (initial ?? '') === '' ? '' : initial;
    if(type!=='date'){ input.setAttribute('inputmode','decimal'); input.setAttribute('pattern','[0-9]*'); }
    function commit(){
      onCommit(input.value);
    }
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ input.blur(); } });
    wrap.appendChild(input);
    return wrap;
  }

  function renderExpenseCards(){
    const cont = document.getElementById('expenseCards');
    if(!cont) return;
    cont.innerHTML = '';
    const m = currentMonth();
    if(!m || !Array.isArray(m.expenseGroups)) return;
    m.expenseGroups.forEach((g,gi)=>{
      const group = document.createElement('div');
      group.className = 'card-group';
      const gt = document.createElement('div');
      gt.className = 'group-title'; gt.textContent = g.group || 'Group';
      group.appendChild(gt);
      (g.items||[]).forEach((it,ii)=>{
        const c = document.createElement('div');
        c.className = 'card-item editable';
        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = it.name || 'Item';
        c.appendChild(title);

        // Planned
        const row1 = document.createElement('div'); row1.className='card-row';
        const l1 = document.createElement('span'); l1.className='label'; l1.textContent='Planned';
        const v1 = document.createElement('span'); v1.className='value editable'; v1.textContent='$'+fmt(it.planned);
        v1.addEventListener('click', ()=>{
          const rep = createEditableValue(it.planned,'number',(val)=>{
            it.planned = Number(val)||0; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary();
          });
          v1.replaceWith(rep.querySelector('input').parentElement); rep.querySelector('input').focus();
        });
        row1.appendChild(l1); row1.appendChild(v1);

        // Actual
        const row2 = document.createElement('div'); row2.className='card-row';
        const l2 = document.createElement('span'); l2.className='label'; l2.textContent='Actual';
        const v2 = document.createElement('span'); v2.className='value editable'; v2.textContent='$'+fmt(it.actual);
        v2.addEventListener('click', ()=>{
          const rep = createEditableValue(it.actual,'number',(val)=>{
            it.actual = Number(val)||0; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary();
          });
          v2.replaceWith(rep.querySelector('input').parentElement); rep.querySelector('input').focus();
        });
        row2.appendChild(l2); row2.appendChild(v2);

        // Date
        const row3 = document.createElement('div'); row3.className='card-row';
        const l3 = document.createElement('span'); l3.className='label'; l3.textContent='Date';
        const v3 = document.createElement('span'); v3.className='value editable'; v3.textContent = it.date || '—';
        v3.addEventListener('click', ()=>{
          const rep = createEditableValue(it.date,'date',(val)=>{
            it.date = val; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary();
          }, 'Nov 4, 2025');
          v3.replaceWith(rep.querySelector('input').parentElement); rep.querySelector('input').focus();
        });
        row3.appendChild(l3); row3.appendChild(v3);

        c.appendChild(row1); c.appendChild(row2); c.appendChild(row3);
        group.appendChild(c);
      });
      cont.appendChild(group);
    });
  }

  function monthlyInterest(d){
    const apr = Number(d.apr)||0;
    const bal = Number(d.balance)||0;
    if(d.autoInterest){ return bal * (apr/100) / 12; }
    // manual mode
    return Number(d.interest)||0;
  }

  function renderDebtCards(){
    const cont = document.getElementById('debtCards');
    if(!cont) return;
    cont.innerHTML = '';
    const m = currentMonth();
    if(!m || !Array.isArray(m.debts)) return;
    (m.debts||[]).forEach((d,idx)=>{
      const c = document.createElement('div');
      c.className = 'card-item editable';
      const title = document.createElement('div');
      title.className = 'title'; title.textContent = d.name || 'Debt';
      c.appendChild(title);

      // Balance (read-only here)
      const rowBal = document.createElement('div'); rowBal.className='card-row';
      rowBal.innerHTML = '<span class="label">Balance</span><span class="value">$'+fmt(d.balance)+'</span>';

      // Planned payment (editable)
      const rowPl = document.createElement('div'); rowPl.className='card-row';
      const lPl = document.createElement('span'); lPl.className='label'; lPl.textContent='Planned';
      const vPl = document.createElement('span'); vPl.className='value editable'; vPl.textContent='$'+fmt(d.plannedPayment);
      vPl.addEventListener('click', ()=>{
        const rep = createEditableValue(d.plannedPayment,'number',(val)=>{
          d.plannedPayment = Number(val)||0; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary();
        });
        vPl.replaceWith(rep.querySelector('input').parentElement); rep.querySelector('input').focus();
      });
      rowPl.appendChild(lPl); rowPl.appendChild(vPl);

      // Actual payment (editable)
      const rowAc = document.createElement('div'); rowAc.className='card-row';
      const lAc = document.createElement('span'); lAc.className='label'; lAc.textContent='Actual';
      const vAc = document.createElement('span'); vAc.className='value editable'; vAc.textContent='$'+fmt(d.actualPayment);
      vAc.addEventListener('click', ()=>{
        const rep = createEditableValue(d.actualPayment,'number',(val)=>{
          d.actualPayment = Number(val)||0; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary();
        });
        vAc.replaceWith(rep.querySelector('input').parentElement); rep.querySelector('input').focus();
      });
      rowAc.appendChild(lAc); rowAc.appendChild(vAc);

      // Paid On (editable)
      const rowDt = document.createElement('div'); rowDt.className='card-row';
      const lDt = document.createElement('span'); lDt.className='label'; lDt.textContent='Paid On';
      const vDt = document.createElement('span'); vDt.className='value editable'; vDt.textContent = d.paidOn || '—';
      vDt.addEventListener('click', ()=>{
        const rep = createEditableValue(d.paidOn,'date',(val)=>{
          d.paidOn = val; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary();
        }, 'Nov 15, 2025');
        vDt.replaceWith(rep.querySelector('input').parentElement); rep.querySelector('input').focus();
      });
      rowDt.appendChild(lDt); rowDt.appendChild(vDt);

      // APR (editable) + Auto Interest toggle
      const rowApr = document.createElement('div'); rowApr.className='card-row';
      const lApr = document.createElement('span'); lApr.className='label'; lApr.textContent='APR %';
      const vApr = document.createElement('span'); vApr.className='value editable'; vApr.textContent = (Number(d.apr)||0).toString();
      vApr.addEventListener('click', ()=>{
        const rep = createEditableValue(d.apr,'number',(val)=>{
          d.apr = Number(val)||0; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary();
        });
        vApr.replaceWith(rep.querySelector('input').parentElement); rep.querySelector('input').focus();
      });
      rowApr.appendChild(lApr); rowApr.appendChild(vApr);

      const rowAuto = document.createElement('div'); rowAuto.className='switch-inline';
      const chk = document.createElement('input'); chk.type='checkbox'; chk.checked=!!d.autoInterest;
      const lab = document.createElement('label'); lab.textContent='Auto-calc Interest';
      rowAuto.appendChild(chk); rowAuto.appendChild(lab);
      chk.addEventListener('change', ()=>{ d.autoInterest = !!chk.checked; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary(); });

      // Interest (computed or manual display)
      const rowInt = document.createElement('div'); rowInt.className='card-row';
      const lInt = document.createElement('span'); lInt.className='label'; lInt.textContent='Interest (this month)';
      const interestVal = monthlyInterest(d);
      const vInt = document.createElement('span'); vInt.className='value'; vInt.innerHTML = '<span class="badge">$'+fmt(interestVal)+'</span>';
      rowInt.appendChild(lInt); rowInt.appendChild(vInt);

      c.appendChild(rowBal); c.appendChild(rowPl); c.appendChild(rowAc); c.appendChild(rowDt);
      c.appendChild(rowApr); c.appendChild(rowAuto); c.appendChild(rowInt);

      cont.appendChild(c);
    });
  }

  function renderMobileCards(){ renderExpenseCards(); renderDebtCards(); }
  // Hook into existing renderAll
  (function(){
    const old = window.renderAll;
    window.renderAll = function(){ if(typeof old==='function') old(); renderMobileCards(); };
  })();
  document.addEventListener('DOMContentLoaded', renderMobileCards);
  document.addEventListener('change', function(e){
    if(e.target && e.target.id==='monthSelect'){ renderMobileCards(); }
  });
  window.addEventListener('resize', renderMobileCards);
})();


// v2.21: Debt balance editable + Income cards + editable Transactions cards
(function(){
  function fmt(n){ if(n===undefined||n===null||n==='') return '0.00'; var v=Number(n)||0; return v.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}); }
  function currentMonth(){
    const sel = document.getElementById('monthSelect');
    return sel && sel.value && data.months ? data.months[sel.value] : null;
  }
  function createEditableValue(initial, type, onCommit, placeholder){
    const wrap = document.createElement('span');
    wrap.className = 'value editable';
    const input = document.createElement('input');
    input.type = (type==='date') ? 'text' : 'number';
    if(type==='date'){ input.placeholder = placeholder || 'MMM D, YYYY'; }
    input.value = (initial ?? '') === '' ? '' : initial;
    if(type!=='date'){ input.setAttribute('inputmode','decimal'); input.setAttribute('pattern','[0-9]*'); }
    function commit(){ onCommit(input.value); }
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ input.blur(); } });
    wrap.appendChild(input);
    return wrap;
  }

  // --- Income cards (match Expenses layout, no Date) ---
  function renderIncomeCards(){
    const cont = document.getElementById('incomeCards');
    if(!cont) return;
    cont.innerHTML = '';
    const m = currentMonth();
    if(!m || !Array.isArray(m.income)) return;
    const group = document.createElement('div');
    group.className = 'card-group';
    const gt = document.createElement('div'); gt.className='group-title'; gt.textContent = 'Income';
    group.appendChild(gt);
    m.income.forEach((row,idx)=>{
      const c = document.createElement('div'); c.className='card-item editable';
      const title = document.createElement('div'); title.className='title'; title.textContent = row.name || 'Income';
      c.appendChild(title);
      // Planned
      const r1 = document.createElement('div'); r1.className='card-row';
      const l1 = document.createElement('span'); l1.className='label'; l1.textContent='Planned';
      const v1 = document.createElement('span'); v1.className='value editable'; v1.textContent='$'+fmt(row.planned);
      v1.addEventListener('click', ()=>{
        const rep = createEditableValue(row.planned,'number',(val)=>{ row.planned = Number(val)||0; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary(); });
        v1.replaceWith(rep.querySelector('input').parentElement); rep.querySelector('input').focus();
      });
      r1.appendChild(l1); r1.appendChild(v1);
      // Actual
      const r2 = document.createElement('div'); r2.className='card-row';
      const l2 = document.createElement('span'); l2.className='label'; l2.textContent='Actual';
      const v2 = document.createElement('span'); v2.className='value editable'; v2.textContent='$'+fmt(row.actual);
      v2.addEventListener('click', ()=>{
        const rep = createEditableValue(row.actual,'number',(val)=>{ row.actual = Number(val)||0; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary(); });
        v2.replaceWith(rep.querySelector('input').parentElement); rep.querySelector('input').focus();
      });
      r2.appendChild(l2); r2.appendChild(v2);
      c.appendChild(r1); c.appendChild(r2);
      group.appendChild(c);
    });
    cont.appendChild(group);
  }

  // --- Extend Debt cards: make Balance editable ---
  function enableDebtBalanceEditing(container){
    container.querySelectorAll('.card-item').forEach((card, idx)=>{
      const m = currentMonth(); if(!m) return;
      const d = m.debts[idx]; if(!d) return;
      const rowBal = card.querySelector('.card-row'); // first row is Balance
      if(!rowBal) return;
      const valSpan = rowBal.querySelector('.value');
      if(!valSpan) return;
      // Replace with editable behavior
      valSpan.classList.add('editable');
      valSpan.addEventListener('click', ()=>{
        const rep = createEditableValue(d.balance,'number',(val)=>{
          d.balance = Number(val)||0; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary(); // re-render original function
        });
        valSpan.replaceWith(rep.querySelector('input').parentElement); rep.querySelector('input').focus();
      });
    });
  }

  // --- Transactions cards (editable) ---
  function renderTransactionCards(){
    const m = currentMonth(); if(!m) return;
    const using = data.settings && data.settings.useTransactions;
    const expCont = document.getElementById('expenseTxCards');
    const incCont = document.getElementById('incomeTxCards');
    if(!expCont || !incCont) return;

    // Toggle visibility by aria-hidden (css still displays grid)
    expCont.setAttribute('aria-hidden', using ? 'false' : 'true');
    incCont.setAttribute('aria-hidden', using ? 'false' : 'true');

    expCont.innerHTML = '';
    incCont.innerHTML = '';

    if(using){
      // Expense transactions: expect m.transactions = [{name,date,amount,group?}]
      if(Array.isArray(m.transactions)){
        const g = document.createElement('div'); g.className='card-group';
        const t = document.createElement('div'); t.className='group-title'; t.textContent='Expense Transactions';
        g.appendChild(t);
        m.transactions.forEach((tx, i)=>{
          const c = document.createElement('div'); c.className='card-item editable';
          const title = document.createElement('div'); title.className='title'; title.textContent = tx.name || 'Transaction';
          c.appendChild(title);

          // Amount
          const r1 = document.createElement('div'); r1.className='card-row';
          const l1 = document.createElement('span'); l1.className='label'; l1.textContent='Amount';
          const v1 = document.createElement('span'); v1.className='value editable'; v1.textContent='$'+fmt(tx.amount);
          v1.addEventListener('click', ()=>{
            const rep = createEditableValue(tx.amount,'number',(val)=>{ tx.amount = Number(val)||0; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary(); });
            v1.replaceWith(rep.querySelector('input').parentElement); rep.querySelector('input').focus();
          });
          r1.appendChild(l1); r1.appendChild(v1);

          // Date
          const r2 = document.createElement('div'); r2.className='card-row';
          const l2 = document.createElement('span'); l2.className='label'; l2.textContent='Date';
          const v2 = document.createElement('span'); v2.className='value editable'; v2.textContent = tx.date || '—';
          v2.addEventListener('click', ()=>{
            const rep = createEditableValue(tx.date,'date',(val)=>{ tx.date = val; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary(); }, 'Nov 4, 2025');
            v2.replaceWith(rep.querySelector('input').parentElement); rep.querySelector('input').focus();
          });
          r2.appendChild(l2); r2.appendChild(v2);

          // Optional group/category
          const r3 = document.createElement('div'); r3.className='card-row';
          const l3 = document.createElement('span'); l3.className='label'; l3.textContent='Category';
          const v3 = document.createElement('span'); v3.className='value editable'; v3.textContent = tx.group || (tx.category||'—');
          v3.addEventListener('click', ()=>{
            const rep = createEditableValue(tx.group || tx.category,'date',(val)=>{ if('group' in tx) tx.group = val; else tx.category = val; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary(); }, 'Housing / Fuel');
            v3.replaceWith(rep.querySelector('input').parentElement); rep.querySelector('input').focus();
          });
          r3.appendChild(l3); r3.appendChild(v3);

          c.appendChild(r1); c.appendChild(r2); c.appendChild(r3);
          g.appendChild(c);
        });
        expCont.appendChild(g);
      }
      // Income transactions: expect m.incomeTransactions = [{name,date,amount}]
      if(Array.isArray(m.incomeTransactions)){
        const g2 = document.createElement('div'); g2.className='card-group';
        const t2 = document.createElement('div'); t2.className='group-title'; t2.textContent='Income Transactions';
        g2.appendChild(t2);
        m.incomeTransactions.forEach((tx, i)=>{
          const c = document.createElement('div'); c.className='card-item editable';
          const title = document.createElement('div'); title.className='title'; title.textContent = tx.name || 'Income';
          c.appendChild(title);

          // Amount
          const r1 = document.createElement('div'); r1.className='card-row';
          const l1 = document.createElement('span'); l1.className='label'; l1.textContent='Amount';
          const v1 = document.createElement('span'); v1.className='value editable'; v1.textContent='$'+fmt(tx.amount);
          v1.addEventListener('click', ()=>{
            const rep = createEditableValue(tx.amount,'number',(val)=>{ tx.amount = Number(val)||0; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary(); });
            v1.replaceWith(rep.querySelector('input').parentElement); rep.querySelector('input').focus();
          });
          r1.appendChild(l1); r1.appendChild(v1);

          // Date (only if present/wanted)
          const r2 = document.createElement('div'); r2.className='card-row';
          const l2 = document.createElement('span'); l2.className='label'; l2.textContent='Date';
          const v2 = document.createElement('span'); v2.className='value editable'; v2.textContent = tx.date || '—';
          v2.addEventListener('click', ()=>{
            const rep = createEditableValue(tx.date,'date',(val)=>{ tx.date = val; __commitAndRerender(); if(window.__renderSummary) window.__renderSummary(); }, 'Nov 1, 2025');
            v2.replaceWith(rep.querySelector('input').parentElement); rep.querySelector('input').focus();
          });
          r2.appendChild(l2); r2.appendChild(v2);

          c.appendChild(r1); c.appendChild(r2);
          g2.appendChild(c);
        });
        incCont.appendChild(g2);
      }
    }
  }

  // Orig renderers exist from v2.20: renderExpenseCards, renderDebtCards
  // We wrap / extend calls
  const _renderAll = window.renderAll;
  window.renderAll = function(){ if(typeof _renderAll==='function') _renderAll(); renderIncomeCards(); renderTransactionCards(); setTimeout(()=>{
    const dc = document.getElementById('debtCards'); if(dc) enableDebtBalanceEditing(dc);
  },0); };

  document.addEventListener('DOMContentLoaded', ()=>{ renderIncomeCards(); renderTransactionCards(); const dc = document.getElementById('debtCards'); if(dc) enableDebtBalanceEditing(dc); });
  document.addEventListener('change', function(e){ if(e.target && e.target.id==='monthSelect'){ renderIncomeCards(); renderTransactionCards(); const dc = document.getElementById('debtCards'); if(dc) enableDebtBalanceEditing(dc); } });
  window.addEventListener('resize', function(){ renderIncomeCards(); renderTransactionCards(); });
})();


// v2.21.1: ensure summary & totals update immediately after inline edits
window.__commitAndRerender = function(){
  try{ saveData(); }catch(e){}
  try{ if (typeof window.renderAll === 'function') window.renderAll(); }catch(e){}
};


// v2.21.2: iOS keyboard/zoom UX improvements
(function(){
  const vv = window.visualViewport;
  if (!vv) return;
  function onResize(){
    // When the on-screen keyboard opens, the visual viewport height shrinks
    const open = vv.height < window.innerHeight - 100; // heuristic
    document.body.classList.toggle('keyboard-open', open);
  }
  vv.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  document.addEventListener('focusin', onResize);
  document.addEventListener('focusout', onResize);
})();


// v2.22: Rename/Delete for groups & items (expenses), plus income/debt names
(function(){
  function promptText(title, initial){
    const val = window.prompt(title, initial==null? '': String(initial));
    if(val===null) return null;
    return val.trim();
  }
  function confirmDel(msg){ return window.confirm(msg); }

  // Hook into existing renderers created earlier (v2.18+)
  const _renderExpenseCards = window.renderExpenseCards;
  const _renderDebtCards = window.renderDebtCards;
  const _renderIncomeCards = window.renderIncomeCards;

  window.renderExpenseCards = function(){
    if(typeof _renderExpenseCards==='function') _renderExpenseCards();
    try {
      const mSel = document.getElementById('monthSelect');
      const month = (mSel && data.months) ? data.months[mSel.value] : null;
      const cont = document.getElementById('expenseCards');
      if(!month || !cont) return;
      // Enhance groups with menus and rename on titles
      const groups = month.expenseGroups || [];
      const groupEls = cont.querySelectorAll('.card-group');
      groupEls.forEach((gEl, gi)=>{
        // Insert a header row with actions
        const gt = gEl.querySelector('.group-title');
        if(gt && !gt.classList.contains('wired')){
          gt.classList.add('wired');
          const wrap = document.createElement('div');
          wrap.className = 'title-row';
          const titleSpan = document.createElement('span');
          titleSpan.textContent = gt.textContent;
          titleSpan.className = 'title editable';
          titleSpan.addEventListener('click', ()=>{
            const next = promptText('Rename group', titleSpan.textContent);
            if(next && groups[gi]){
              groups[gi].group = next;
              saveData(); if(window.renderAll) renderAll();
            }
          });
          const actions = document.createElement('div');
          actions.className = 'card-actions';
          // Kebab menu
          const kebab = document.createElement('div'); kebab.className = 'kebab';
          const btn = document.createElement('button'); btn.className='icon-btn'; btn.title='More';
          btn.textContent = '⋯';
          const menu = document.createElement('div'); menu.className='kebab-menu';
          const rn = document.createElement('button'); rn.textContent='Rename Group';
          rn.addEventListener('click', ()=>{
            const next = promptText('Rename group', groups[gi].group||'');
            if(next){ groups[gi].group = next; saveData(); if(window.renderAll) renderAll(); }
            menu.style.display='none';
          });
          const del = document.createElement('button'); del.textContent='Delete Group';
          del.addEventListener('click', ()=>{
            if(confirmDel('Delete group and all its items?')){
              groups.splice(gi,1); saveData(); if(window.renderAll) renderAll();
            }
            menu.style.display='none';
          });
          menu.appendChild(rn); menu.appendChild(del);
          kebab.appendChild(btn); kebab.appendChild(menu);
          btn.addEventListener('click', (e)=>{
            e.stopPropagation();
            menu.style.display = menu.style.display==='block' ? 'none' : 'block';
            const close = (ev)=>{ if(!menu.contains(ev.target) && ev.target!==btn){ menu.style.display='none'; document.removeEventListener('click', close); } };
            setTimeout(()=>document.addEventListener('click', close),0);
          });

          actions.appendChild(kebab);
          wrap.appendChild(titleSpan); wrap.appendChild(actions);
          gt.replaceWith(wrap);
        }

        // Wire item title rename/delete per card
        const cards = gEl.querySelectorAll('.card-item');
        cards.forEach((cEl, ci)=>{
          // Title element is first child with class 'title'
          const title = cEl.querySelector('.title');
          if(!title) return;
          if(!title.classList.contains('wired')){
            title.classList.add('wired','editable');
            title.addEventListener('click', ()=>{
              const group = groups[gi];
              if(!group || !group.items) return;
              const cur = group.items[ci] && group.items[ci].name || '';
              const next = promptText('Rename item', cur);
              if(next && group.items[ci]){
                group.items[ci].name = next;
                saveData(); if(window.renderAll) renderAll();
              }
            });
            // Add a small kebab next to title
            const acts = document.createElement('div'); acts.className='card-actions';
            const keb = document.createElement('div'); keb.className='kebab';
            const b = document.createElement('button'); b.className='icon-btn'; b.textContent='⋯';
            const m = document.createElement('div'); m.className='kebab-menu';
            const rn2 = document.createElement('button'); rn2.textContent='Rename Item';
            rn2.addEventListener('click', ()=>{
              const group = groups[gi]; if(!group) return;
              const cur = group.items[ci] && group.items[ci].name || '';
              const next = promptText('Rename item', cur);
              if(next && group.items[ci]){ group.items[ci].name = next; saveData(); if(window.renderAll) renderAll(); }
              m.style.display='none';
            });
            const del2 = document.createElement('button'); del2.textContent='Delete Item';
            del2.addEventListener('click', ()=>{
              const group = groups[gi]; if(!group) return;
              if(confirmDel('Delete this item?')){
                group.items.splice(ci,1); saveData(); if(window.renderAll) renderAll();
              }
              m.style.display='none';
            });
            m.appendChild(rn2); m.appendChild(del2);
            keb.appendChild(b); keb.appendChild(m);
            b.addEventListener('click', (e)=>{
              e.stopPropagation();
              m.style.display = m.style.display==='block' ? 'none' : 'block';
              const close = (ev)=>{ if(!m.contains(ev.target) && ev.target!==b){ m.style.display='none'; document.removeEventListener('click', close); } };
              setTimeout(()=>document.addEventListener('click', close),0);
            });
            // Insert acts after title text
            const row = title.parentElement;
            if(row && row.classList.contains('title-row')){
              row.appendChild(acts); acts.appendChild(keb);
            }
          }
        });
      });
    } catch(e){ /* noop */ }
  };

  window.renderIncomeCards = function(){
    if(typeof _renderIncomeCards==='function') _renderIncomeCards();
    try{
      const mSel = document.getElementById('monthSelect');
      const month = (mSel && data.months) ? data.months[mSel.value] : null;
      const cont = document.getElementById('incomeCards');
      if(!month || !cont) return;
      const rows = month.income || [];
      const cards = cont.querySelectorAll('.card-item');
      cards.forEach((cEl, idx)=>{
        const title = cEl.querySelector('.title');
        if(!title) return;
        if(!title.classList.contains('wired')){
          title.classList.add('wired','editable');
          title.addEventListener('click', ()=>{
            const cur = rows[idx] && rows[idx].name || '';
            const next = promptText('Rename income', cur);
            if(next && rows[idx]){ rows[idx].name = next; saveData(); if(window.renderAll) renderAll(); }
          });
          // kebab for delete
          const acts = document.createElement('div'); acts.className='card-actions';
          const keb = document.createElement('div'); keb.className='kebab';
          const b = document.createElement('button'); b.className='icon-btn'; b.textContent='⋯';
          const m = document.createElement('div'); m.className='kebab-menu';
          const del = document.createElement('button'); del.textContent='Delete Income';
          del.addEventListener('click', ()=>{
            if(confirmDel('Delete this income line?')){
              rows.splice(idx,1); saveData(); if(window.renderAll) renderAll();
            }
            m.style.display='none';
          });
          m.appendChild(del);
          keb.appendChild(b); keb.appendChild(m);
          b.addEventListener('click', (e)=>{
            e.stopPropagation();
            m.style.display = m.style.display==='block' ? 'none' : 'block';
            const close = (ev)=>{ if(!m.contains(ev.target) && ev.target!==b){ m.style.display='none'; document.removeEventListener('click', close); } };
            setTimeout(()=>document.addEventListener('click', close),0);
          });
          // Append to the title row
          const row = title.parentElement;
          if(row && row.classList.contains('title-row')){
            row.appendChild(acts); acts.appendChild(keb);
          } else {
            // If not using title-row here, append to card top
            cEl.insertBefore(acts, cEl.firstChild.nextSibling);
            acts.appendChild(keb);
          }
        }
      });
    }catch(e){}
  };

  window.renderDebtCards = function(){
    if(typeof _renderDebtCards==='function') _renderDebtCards();
    try{
      const mSel = document.getElementById('monthSelect');
      const month = (mSel && data.months) ? data.months[mSel.value] : null;
      const cont = document.getElementById('debtCards');
      if(!month || !cont) return;
      const rows = month.debts || [];
      const cards = cont.querySelectorAll('.card-item');
      cards.forEach((cEl, idx)=>{
        const title = cEl.querySelector('.title');
        if(!title) return;
        if(!title.classList.contains('wired')){
          title.classList.add('wired','editable');
          title.addEventListener('click', ()=>{
            const cur = rows[idx] && rows[idx].name || '';
            const next = promptText('Rename debt', cur);
            if(next && rows[idx]){ rows[idx].name = next; saveData(); if(window.renderAll) renderAll(); }
          });
          // kebab for delete
          const acts = document.createElement('div'); acts.className='card-actions';
          const keb = document.createElement('div'); keb.className='kebab';
          const b = document.createElement('button'); b.className='icon-btn'; b.textContent='⋯';
          const m = document.createElement('div'); m.className='kebab-menu';
          const del = document.createElement('button'); del.textContent='Delete Debt';
          del.addEventListener('click', ()=>{
            if(confirmDel('Delete this debt line?')){
              rows.splice(idx,1); saveData(); if(window.renderAll) renderAll();
            }
            m.style.display='none';
          });
          m.appendChild(del);
          keb.appendChild(b); keb.appendChild(m);
          b.addEventListener('click', (e)=>{
            e.stopPropagation();
            m.style.display = m.style.display==='block' ? 'none' : 'block';
            const close = (ev)=>{ if(!m.contains(ev.target) && ev.target!==b){ m.style.display='none'; document.removeEventListener('click', close); } };
            setTimeout(()=>document.addEventListener('click', close),0);
          });
          // Append to row
          const row = title.parentElement;
          if(row && row.classList.contains('title-row')){
            row.appendChild(acts); acts.appendChild(keb);
          } else {
            cEl.insertBefore(acts, cEl.firstChild.nextSibling);
            acts.appendChild(keb);
          }
        }
      });
    }catch(e){}
  };

  // Re-render after wiring
  const _all = window.renderAll;
  window.renderAll = function(){ if(typeof _all==='function') _all(); window.renderExpenseCards && window.renderExpenseCards(); window.renderIncomeCards && window.renderIncomeCards(); window.renderDebtCards && window.renderDebtCards(); };
})(); 


// v2.22.1: Robust inline rename/delete by building controls directly in renderers
(function(){
  function fmt(n){ if(n===undefined||n===null||n==='') return '0.00'; var v=Number(n)||0; return v.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}); }
  function monthObj(){
    const sel = document.getElementById('monthSelect');
    return sel && sel.value && data.months ? data.months[sel.value] : null;
  }
  function promptText(title, initial){
    const val = window.prompt(title, initial==null? '': String(initial));
    if(val===null) return null;
    return val.trim();
  }

  // Helper: editable span generator
  function editableSpan(initial, type, onCommit, placeholder){
    const span = document.createElement('span');
    span.className = 'value editable';
    span.textContent = (type==='number') ? ('$'+fmt(initial)) : (initial || '—');
    span.addEventListener('click', ()=>{
      const input = document.createElement('input');
      input.type = (type==='date') ? 'text' : 'number';
      if(type!=='date'){ input.setAttribute('inputmode','decimal'); input.setAttribute('pattern','[0-9]*'); }
      if(type==='date' && placeholder){ input.placeholder = placeholder; }
      input.value = (initial ?? '') === '' ? '' : initial;
      function commit(){ onCommit(input.value); window.__commitAndRerender ? __commitAndRerender() : (saveData(), renderAll&&renderAll()); }
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ input.blur(); } });
      span.replaceWith(input);
      input.focus();
    });
    return span;
  }

  // EXPENSES: full re-render with title row + kebab menu + inline edit
  window.renderExpenseCards = function(){
    const cont = document.getElementById('expenseCards');
    const m = monthObj();
    if(!cont || !m) return;
    cont.innerHTML='';
    (m.expenseGroups||[]).forEach((g, gi)=>{
      const group = document.createElement('div');
      group.className = 'card-group';

      const header = document.createElement('div');
      header.className = 'title-row';
      const title = document.createElement('div');
      title.className = 'title editable';
      title.textContent = g.group || 'Group';
      title.addEventListener('click', ()=>{
        const next = promptText('Rename group', g.group||'');
        if(next){ g.group = next; saveData(); renderAll&&renderAll(); }
      });

      const actions = document.createElement('div'); actions.className='card-actions';
      const keb = document.createElement('div'); keb.className='kebab';
      const b = document.createElement('button'); b.className='icon-btn'; b.textContent='⋯';
      const menu = document.createElement('div'); menu.className='kebab-menu';
      const rn = document.createElement('button'); rn.textContent='Rename Group';
      rn.addEventListener('click', ()=>{ const next = promptText('Rename group', g.group||''); if(next){ g.group=next; saveData(); renderAll&&renderAll(); } menu.style.display='none'; });
      const del = document.createElement('button'); del.textContent='Delete Group';
      del.addEventListener('click', ()=>{ if(confirm('Delete group and all items?')){ (m.expenseGroups||[]).splice(gi,1); saveData(); renderAll&&renderAll(); } menu.style.display='none'; });
      menu.appendChild(rn); menu.appendChild(del);
      keb.appendChild(b); keb.appendChild(menu);
      b.addEventListener('click', (e)=>{
        e.stopPropagation();
        menu.style.display = menu.style.display==='block' ? 'none' : 'block';
        const close=(ev)=>{ if(!menu.contains(ev.target) && ev.target!==b){ menu.style.display='none'; document.removeEventListener('click', close); } };
        setTimeout(()=>document.addEventListener('click', close),0);
      });
      actions.appendChild(keb);

      header.appendChild(title); header.appendChild(actions);
      group.appendChild(header);

      (g.items||[]).forEach((it, ii)=>{
        const c = document.createElement('div'); c.className='card-item editable';
        // title row for item
        const tr = document.createElement('div'); tr.className='title-row';
        const tt = document.createElement('div'); tt.className='title editable'; tt.textContent = it.name || 'Item';
        tt.addEventListener('click', ()=>{
          const next = promptText('Rename item', it.name||''); if(next){ it.name = next; saveData(); renderAll&&renderAll(); }
        });
        const acts = document.createElement('div'); acts.className='card-actions';
        const keb2 = document.createElement('div'); keb2.className='kebab';
        const bb = document.createElement('button'); bb.className='icon-btn'; bb.textContent='⋯';
        const mm = document.createElement('div'); mm.className='kebab-menu';
        const rn2 = document.createElement('button'); rn2.textContent='Rename Item';
        rn2.addEventListener('click', ()=>{ const next = promptText('Rename item', it.name||''); if(next){ it.name=next; saveData(); renderAll&&renderAll(); } mm.style.display='none'; });
        const del2 = document.createElement('button'); del2.textContent='Delete Item';
        del2.addEventListener('click', ()=>{ if(confirm('Delete this item?')){ g.items.splice(ii,1); saveData(); renderAll&&renderAll(); } mm.style.display='none'; });
        mm.appendChild(rn2); mm.appendChild(del2);
        keb2.appendChild(bb); keb2.appendChild(mm);
        bb.addEventListener('click', (e)=>{
          e.stopPropagation();
          mm.style.display = mm.style.display==='block' ? 'none' : 'block';
          const close=(ev)=>{ if(!mm.contains(ev.target) && ev.target!==bb){ mm.style.display='none'; document.removeEventListener('click', close); } };
          setTimeout(()=>document.addEventListener('click', close),0);
        });
        acts.appendChild(keb2);
        tr.appendChild(tt); tr.appendChild(acts);
        c.appendChild(tr);

        // planned
        const r1 = document.createElement('div'); r1.className='card-row';
        const l1 = document.createElement('span'); l1.className='label'; l1.textContent='Planned';
        const v1 = editableSpan(it.planned,'number',(val)=>{ it.planned = Number(val)||0; }, null);
        r1.appendChild(l1); r1.appendChild(v1);
        // actual
        const r2 = document.createElement('div'); r2.className='card-row';
        const l2 = document.createElement('span'); l2.className='label'; l2.textContent='Actual';
        const v2 = editableSpan(it.actual,'number',(val)=>{ it.actual = Number(val)||0; }, null);
        r2.appendChild(l2); r2.appendChild(v2);
        // date
        const r3 = document.createElement('div'); r3.className='card-row';
        const l3 = document.createElement('span'); l3.className='label'; l3.textContent='Date';
        const v3 = editableSpan(it.date,'date',(val)=>{ it.date = val; }, 'Nov 4, 2025');
        r3.appendChild(l3); r3.appendChild(v3);

        c.appendChild(r1); c.appendChild(r2); c.appendChild(r3);
        group.appendChild(c);
      });
      cont.appendChild(group);
    });
  };

  // INCOME: render with title rename and delete
  window.renderIncomeCards = function(){
    const cont = document.getElementById('incomeCards');
    const m = monthObj();
    if(!cont || !m) return;
    cont.innerHTML='';
    const group = document.createElement('div'); group.className='card-group';
    const header = document.createElement('div'); header.className='group-title'; header.textContent='Income';
    group.appendChild(header);
    (m.income||[]).forEach((row, idx)=>{
      const c = document.createElement('div'); c.className='card-item editable';
      const tr = document.createElement('div'); tr.className='title-row';
      const tt = document.createElement('div'); tt.className='title editable'; tt.textContent=row.name||'Income';
      tt.addEventListener('click', ()=>{
        const next = promptText('Rename income', row.name||''); if(next){ row.name=next; saveData(); renderAll&&renderAll(); }
      });
      const acts = document.createElement('div'); acts.className='card-actions';
      const keb = document.createElement('div'); keb.className='kebab';
      const b = document.createElement('button'); b.className='icon-btn'; b.textContent='⋯';
      const menu = document.createElement('div'); menu.className='kebab-menu';
      const del = document.createElement('button'); del.textContent='Delete Income';
      del.addEventListener('click', ()=>{ if(confirm('Delete this income line?')){ m.income.splice(idx,1); saveData(); renderAll&&renderAll(); } menu.style.display='none'; });
      menu.appendChild(del);
      keb.appendChild(b); keb.appendChild(menu);
      b.addEventListener('click', (e)=>{
        e.stopPropagation();
        menu.style.display = menu.style.display==='block' ? 'none' : 'block';
        const close=(ev)=>{ if(!menu.contains(ev.target) && ev.target!==b){ menu.style.display='none'; document.removeEventListener('click', close); } };
        setTimeout(()=>document.addEventListener('click', close),0);
      });
      acts.appendChild(keb);
      tr.appendChild(tt); tr.appendChild(acts);
      c.appendChild(tr);

      const r1 = document.createElement('div'); r1.className='card-row';
      const l1 = document.createElement('span'); l1.className='label'; l1.textContent='Planned';
      const v1 = editableSpan(row.planned,'number',(val)=>{ row.planned=Number(val)||0; }, null);
      r1.appendChild(l1); r1.appendChild(v1);

      const r2 = document.createElement('div'); r2.className='card-row';
      const l2 = document.createElement('span'); l2.className='label'; l2.textContent='Actual';
      const v2 = editableSpan(row.actual,'number',(val)=>{ row.actual=Number(val)||0; }, null);
      r2.appendChild(l2); r2.appendChild(v2);

      c.appendChild(r1); c.appendChild(r2);
      group.appendChild(c);
    });
    cont.appendChild(group);
  };

  // DEBTS: render with title rename/delete and editable balance
  window.renderDebtCards = function(){
    const cont = document.getElementById('debtCards');
    const m = monthObj();
    if(!cont || !m) return;
    cont.innerHTML='';
    (m.debts||[]).forEach((d, idx)=>{
      const c = document.createElement('div'); c.className='card-item editable';

      const tr = document.createElement('div'); tr.className='title-row';
      const tt = document.createElement('div'); tt.className='title editable'; tt.textContent = d.name || 'Debt';
      tt.addEventListener('click', ()=>{ const n = promptText('Rename debt', d.name||''); if(n){ d.name=n; saveData(); renderAll&&renderAll(); } });
      const acts = document.createElement('div'); acts.className='card-actions';
      const keb = document.createElement('div'); keb.className='kebab';
      const b = document.createElement('button'); b.className='icon-btn'; b.textContent='⋯';
      const menu = document.createElement('div'); menu.className='kebab-menu';
      const del = document.createElement('button'); del.textContent='Delete Debt';
      del.addEventListener('click', ()=>{ if(confirm('Delete this debt line?')){ m.debts.splice(idx,1); saveData(); renderAll&&renderAll(); } menu.style.display='none'; });
      menu.appendChild(del);
      keb.appendChild(b); keb.appendChild(menu);
      b.addEventListener('click', (e)=>{
        e.stopPropagation();
        menu.style.display = menu.style.display==='block' ? 'none' : 'block';
        const close=(ev)=>{ if(!menu.contains(ev.target) && ev.target!==b){ menu.style.display='none'; document.removeEventListener('click', close); } };
        setTimeout(()=>document.addEventListener('click', close),0);
      });
      acts.appendChild(keb);
      tr.appendChild(tt); tr.appendChild(acts);
      c.appendChild(tr);

      const rBal = document.createElement('div'); rBal.className='card-row';
      const lBal = document.createElement('span'); lBal.className='label'; lBal.textContent='Balance';
      const vBal = editableSpan(d.balance,'number',(val)=>{ d.balance=Number(val)||0; }, null);
      rBal.appendChild(lBal); rBal.appendChild(vBal);

      const rPl = document.createElement('div'); rPl.className='card-row';
      const lPl = document.createElement('span'); lPl.className='label'; lPl.textContent='Planned';
      const vPl = editableSpan(d.plannedPayment,'number',(val)=>{ d.plannedPayment=Number(val)||0; }, null);
      rPl.appendChild(lPl); rPl.appendChild(vPl);

      const rAc = document.createElement('div'); rAc.className='card-row';
      const lAc = document.createElement('span'); lAc.className='label'; lAc.textContent='Actual';
      const vAc = editableSpan(d.actualPayment,'number',(val)=>{ d.actualPayment=Number(val)||0; }, null);
      rAc.appendChild(lAc); rAc.appendChild(vAc);

      const rDt = document.createElement('div'); rDt.className='card-row';
      const lDt = document.createElement('span'); lDt.className='label'; lDt.textContent='Paid On';
      const vDt = editableSpan(d.paidOn,'date',(val)=>{ d.paidOn=val; }, 'Nov 15, 2025');
      rDt.appendChild(lDt); rDt.appendChild(vDt);

      const rApr = document.createElement('div'); rApr.className='card-row';
      const lApr = document.createElement('span'); lApr.className='label'; lApr.textContent='APR %';
      const vApr = editableSpan(d.apr,'number',(val)=>{ d.apr=Number(val)||0; }, null);
      rApr.appendChild(lApr); rApr.appendChild(vApr);

      const rInt = document.createElement('div'); rInt.className='card-row';
      const lInt = document.createElement('span'); lInt.className='label'; lInt.textContent='Interest (this month)';
      const interest = (d.autoInterest? (Number(d.balance)||0)*(Number(d.apr)||0)/100/12 : (Number(d.interest)||0));
      const vInt = document.createElement('span'); vInt.className='value'; vInt.textContent = '$'+fmt(interest);
      rInt.appendChild(lInt); rInt.appendChild(vInt);

      c.appendChild(rBal); c.appendChild(rPl); c.appendChild(rAc); c.appendChild(rDt); c.appendChild(rApr); c.appendChild(rInt);
      cont.appendChild(c);
    });
  };

  // Ensure global render calls our overrides
  const _renderAll = window.renderAll;
  window.renderAll = function(){ if(typeof _renderAll==='function') _renderAll(); window.renderExpenseCards(); window.renderIncomeCards(); window.renderDebtCards(); };
  document.addEventListener('DOMContentLoaded', ()=>{ window.renderExpenseCards(); window.renderIncomeCards(); window.renderDebtCards(); });
  document.addEventListener('change', (e)=>{ if(e.target && e.target.id==='monthSelect'){ window.renderExpenseCards(); window.renderIncomeCards(); window.renderDebtCards(); }});
  window.addEventListener('resize', ()=>{ window.renderExpenseCards(); window.renderIncomeCards(); window.renderDebtCards(); });
})();



// v2.22.6: Keep kebab menus in view (flyout on desktop, bottom sheet on mobile)
(function(){
  function isMobile(){ return window.matchMedia && window.matchMedia('(max-width:700px)').matches; }

  function openMenu(btn, menu){
    // Close others
    document.querySelectorAll('.kebab-menu').forEach(m=>{ m.style.display='none'; m.dataset.open='0'; m.classList.remove('mobile'); });
    // Scrim for mobile
    let scrim = document.querySelector('.menu-scrim');
    if(!scrim){
      scrim = document.createElement('div');
      scrim.className = 'menu-scrim';
      document.body.appendChild(scrim);
    }
    const mobile = isMobile();
    if(mobile){
      menu.classList.add('mobile');
      // bottom sheet
      menu.style.left = '0'; menu.style.right='0';
      menu.style.top = 'auto'; menu.style.bottom='0';
      menu.style.display = 'block'; menu.dataset.open='1';
      scrim.classList.add('show');
      const close = (ev)=>{
        if(!menu.contains(ev.target) && ev.target!==btn){
          menu.style.display='none'; menu.dataset.open='0'; menu.classList.remove('mobile');
          scrim.classList.remove('show');
          document.removeEventListener('click', close);
        }
      };
      setTimeout(()=>document.addEventListener('click', close),0);
    } else {
      // desktop flyout near button
      const rect = btn.getBoundingClientRect();
      const mw = 240;
      const mh = Math.min(300, window.innerHeight * 0.65);
      menu.style.minWidth = mw + 'px';
      menu.style.maxHeight = mh + 'px';
      let left = Math.min(rect.left, window.innerWidth - mw - 8);
      let top = rect.bottom + 8;
      if (top + mh > window.innerHeight - 8){
        top = Math.max(8, rect.top - mh - 8);
      }
      left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - 8));
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
      menu.style.display = 'block'; menu.dataset.open='1';
      scrim.classList.remove('show');
      const close = (ev)=>{
        if(!menu.contains(ev.target) && ev.target!==btn){
          menu.style.display='none'; menu.dataset.open='0';
          document.removeEventListener('click', close);
        }
      };
      setTimeout(()=>document.addEventListener('click', close),0);
    }
  }

  document.addEventListener('click', function(e){
    const btn = e.target.closest && e.target.closest('.kebab .icon-btn');
    if(btn){
      const menu = btn.nextElementSibling;
      if(menu && menu.classList.contains('kebab-menu')){
        e.stopPropagation();
        const isOpen = menu.dataset.open === '1';
        if(isOpen){
          menu.style.display='none'; menu.dataset.open='0'; menu.classList.remove('mobile');
          const s = document.querySelector('.menu-scrim'); if(s) s.classList.remove('show');
        } else {
          openMenu(btn, menu);
        }
      }
    }
  });
})();



// v2.22.7: Robust kebab menu open/close (works after re-renders)
(function(){
  function isMobile(){ return window.matchMedia && window.matchMedia('(max-width:700px)').matches; }
  function ensureScrim(){
    let s = document.querySelector('.menu-scrim');
    if(!s){ s = document.createElement('div'); s.className='menu-scrim'; document.body.appendChild(s); }
    return s;
  }
  function openMenu(btn, menu){
    document.querySelectorAll('.kebab-menu').forEach(m=>{ m.style.display='none'; m.dataset.open='0'; m.classList.remove('mobile'); });
    const scrim = ensureScrim();
    if(isMobile()){
      menu.classList.add('mobile');
      menu.style.display='block'; menu.dataset.open='1';
      scrim.classList.add('show');
    }else{
      // place near button, clamped
      const rect = btn.getBoundingClientRect();
      const mw = 240; const mh = Math.min(320, window.innerHeight*0.7);
      menu.style.minWidth = mw+'px'; menu.style.maxHeight = mh+'px';
      let left = Math.min(rect.left, window.innerWidth - mw - 8);
      let top = rect.bottom + 8;
      if(top + mh > window.innerHeight - 8){ top = Math.max(8, rect.top - mh - 8); }
      left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - 8));
      menu.style.left = left+'px'; menu.style.top = top+'px';
      menu.style.display='block'; menu.dataset.open='1';
      scrim.classList.remove('show');
    }
    // Close on outside click
    const close = (ev)=>{
      if(!menu.contains(ev.target) && ev.target!==btn){
        menu.style.display='none'; menu.dataset.open='0'; menu.classList.remove('mobile');
        ensureScrim().classList.remove('show');
        document.removeEventListener('click', close);
      }
    };
    setTimeout(()=>document.addEventListener('click', close),0);
  }

  document.addEventListener('click', function(e){
    const btn = e.target.closest && e.target.closest('.kebab .icon-btn, .kebab-btn');
    if(btn){
      const menu = btn.nextElementSibling && btn.nextElementSibling.classList.contains('kebab-menu') ? btn.nextElementSibling : null;
      if(menu){
        e.stopPropagation();
        if(menu.dataset.open==='1'){
          menu.style.display='none'; menu.dataset.open='0'; menu.classList.remove('mobile');
          ensureScrim().classList.remove('show');
        }else{
          openMenu(btn, menu);
        }
      }
    }
  });
})();



// v2.23: Re-render summary with split Planned | Actual per tile
(function(){
  function fmt(n){ n = Number(n)||0; return n.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}); }
  function curMonth(){
    const sel = document.getElementById('monthSelect');
    return sel && sel.value && data.months ? data.months[sel.value] : null;
  }
  function totals(){
    const m = curMonth(); if(!m) return {pi:0, ai:0, pe:0, ae:0};
    // Income totals
    let pi=0, ai=0;
    if (Array.isArray(m.income)){
      m.income.forEach(r=>{ pi += Number(r.planned)||0; ai += Number(r.actual)||0; });
    }
    // Expense totals from groups/items
    let pe=0, ae=0;
    if (Array.isArray(m.expenseGroups)){
      m.expenseGroups.forEach(g=> (g.items||[]).forEach(it=>{
        pe += Number(it.planned)||0; ae += Number(it.actual)||0;
      }));
    }
    // If transactions mode exists and app expects override, we leave that logic to original code;
    // these sums reflect current card edits accurately.
    return {pi, ai, pe, ae};
  }
  function renderSummary(){
    const host = document.querySelector('.summary');
    if(!host) return;
    const t = totals();
    host.innerHTML = [
      ['Income','Planned','Actual', t.pi, t.ai],
      ['Expenses','Planned','Actual', t.pe, t.ae],
    ].map(([title, k1, k2, v1, v2])=>{
      return `<div class="tile">
        <div class="title">${title}</div>
        <div class="pair">
          <div>
            <div class="k">${k1}</div>
            <div class="v">$${fmt(v1)}</div>
          </div>
          <div>
            <div class="k">${k2}</div>
            <div class="v">$${fmt(v2)}</div>
          </div>
        </div>
      </div>`;
    }).join('');
  }
  // Hook into global render
  const old = window.renderAll;
  window.renderAll = function(){ if(typeof old==='function') old(); renderSummary(); };
  document.addEventListener('DOMContentLoaded', renderSummary);
  document.addEventListener('change', (e)=>{ if(e.target && e.target.id==='monthSelect') renderSummary(); });
  window.addEventListener('resize', renderSummary);
  window.__renderSummary = renderSummary;
})();



// v2.23.1: Always-visible delete buttons for groups/items + resilient wiring
(function(){
  function currentMonth(){
    const sel = document.getElementById('monthSelect');
    return sel && sel.value && data.months ? data.months[sel.value] : null;
  }
  function renderDeletes(){
    const m = currentMonth(); if(!m) return;
    const expWrap = document.getElementById('expenseCards'); if(!expWrap) return;
    const groups = Array.from(expWrap.querySelectorAll('.card-group'));
    const modelGroups = Array.isArray(m.expenseGroups) ? m.expenseGroups : [];
    groups.forEach((gEl, gi)=>{
      const header = gEl.querySelector('.title-row, .group-title');
      if(header && !header.querySelector('.row-actions')){
        const actions = document.createElement('div'); actions.className='row-actions';
        // delete group button
        const delG = document.createElement('button'); delG.className='icon-btn danger'; delG.title='Delete Group';
        const ic = document.createElement('span'); ic.className='ic ic-trash'; delG.appendChild(ic);
        delG.addEventListener('click', ()=>{
          if(!modelGroups[gi]) return;
          const name = modelGroups[gi].group || 'this group';
          if(confirm(`Delete "${name}" and all its items?`)){
            modelGroups.splice(gi,1);
            try{ saveData(); }catch(e){}
            try{ if(window.renderAll) window.renderAll(); }catch(e){}
          }
        });
        actions.appendChild(delG);
        header.appendChild(actions);
      }
      // items delete
      const cards = Array.from(gEl.querySelectorAll('.card-item'));
      cards.forEach((cEl, ii)=>{
        let titleRow = cEl.querySelector('.title-row');
        if(!titleRow){
          // create a title-row if missing
          const t = cEl.querySelector('.title');
          if(t){
            titleRow = document.createElement('div'); titleRow.className='title-row';
            t.parentNode.insertBefore(titleRow, t);
            titleRow.appendChild(t);
          }
        }
        if(titleRow && !titleRow.querySelector('.row-actions')){
          const actions = document.createElement('div'); actions.className='row-actions';
          const delI = document.createElement('button'); delI.className='icon-btn danger'; delI.title='Delete Item';
          const ic2 = document.createElement('span'); ic2.className='ic ic-trash'; delI.appendChild(ic2);
          delI.addEventListener('click', ()=>{
            const g = modelGroups[gi]; if(!g || !Array.isArray(g.items) || !g.items[ii]) return;
            const name = g.items[ii].name || 'this item';
            if(confirm(`Delete "${name}"?`)){
              g.items.splice(ii,1);
              try{ saveData(); }catch(e){}
              try{ if(window.renderAll) window.renderAll(); }catch(e){}
            }
          });
          actions.appendChild(delI);
          titleRow.appendChild(actions);
        }
      });
    });
  }
  // Hook into global render to (re)wire after each render
  const _all = window.renderAll;
  window.renderAll = function(){ if(typeof _all==='function') _all(); renderDeletes(); };
  document.addEventListener('DOMContentLoaded', renderDeletes);
  document.addEventListener('change', (e)=>{ if(e.target && e.target.id==='monthSelect'){ renderDeletes(); }});
  window.addEventListener('resize', renderDeletes);
})();



// v2.23.2: Summary includes Debts + Net (Planned | Actual)
(function(){
  function fmt(n){ n = Number(n)||0; return n.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}); }
  function cur(){ const sel=document.getElementById('monthSelect'); return sel&&sel.value&&data.months?data.months[sel.value]:null; }
  function totals(){
    const m = cur(); if(!m) return {pi:0,ai:0,pe:0,ae:0,pd:0,ad:0};
    let pi=0, ai=0, pe=0, ae=0, pd=0, ad=0;
    (m.income||[]).forEach(r=>{ pi+=(+r.planned||0); ai+=(+r.actual||0); });
    (m.expenseGroups||[]).forEach(g=> (g.items||[]).forEach(it=>{ pe+=(+it.planned||0); ae+=(+it.actual||0); }));
    (m.debts||[]).forEach(d=>{ pd+=(+d.plannedPayment||0); ad+=(+d.actualPayment||0); });
    return {pi,ai,pe,ae,pd,ad};
  }
  function render(){
    const host = document.querySelector('.summary'); if(!host) return;
    const t = totals();
    const netP = t.pi - t.pe - t.pd;
    const netA = t.ai - t.ae - t.ad;
    const tiles = [
      ['Income', t.pi, t.ai],
      ['Expenses', t.pe, t.ae],
      ['Debts', t.pd, t.ad],
      ['Net', netP, netA]
    ].map(([title, v1, v2])=>`<div class="tile">
      <div class="title">${title}</div>
      <div class="pair">
        <div><div class="k">Planned</div><div class="v">$${fmt(v1)}</div></div>
        <div><div class="k">Actual</div><div class="v">$${fmt(v2)}</div></div>
      </div>
    </div>`).join('');
    host.innerHTML = tiles;
  }
  const old = window.__renderSummary;
  window.__renderSummary = render;
  // ensure host updates
  const _all = window.renderAll;
  window.renderAll = function(){ if(typeof _all==='function') _all(); render(); };
  document.addEventListener('DOMContentLoaded', render);
  document.addEventListener('change', (e)=>{ if(e.target && e.target.id==='monthSelect') render(); });
  window.addEventListener('resize', render);
})();



// v2.23.2: Remove orphan kebab buttons where no menu exists
(function(){
  function sweep(){
    document.querySelectorAll('.kebab').forEach(k=>{
      const menu = k.querySelector('.kebab-menu');
      const btn = k.querySelector('.icon-btn');
      if(!menu && btn){
        k.classList.add('orphan');
        btn.disabled = true;
        k.style.display='none';
      }
    });
  }
  document.addEventListener('DOMContentLoaded', sweep);
  const _all = window.renderAll;
  window.renderAll = function(){ if(typeof _all==='function') _all(); sweep(); if(window.__renderSummary) window.__renderSummary(); };
})();



// v2.23.2: Add delete button on Debt cards + delete debt transactions
(function(){
  function cur(){ const sel=document.getElementById('monthSelect'); return sel&&sel.value&&data.months?data.months[sel.value]:null; }
  function wireDebts(){
    const m = cur(); if(!m) return;
    const wrap = document.getElementById('debtCards'); if(!wrap) return;
    const cards = wrap.querySelectorAll('.card-item');
    cards.forEach((c, idx)=>{
      if(c.querySelector('.debt-actions')) return;
      // actions container next to the title row if present; otherwise create one
      let titleRow = c.querySelector('.title-row');
      if(!titleRow){
        titleRow = document.createElement('div'); titleRow.className='title-row'; c.prepend(titleRow);
      }
      const actions = document.createElement('div'); actions.className='debt-actions';
      const del = document.createElement('button'); del.className='icon-btn danger'; del.title='Delete Debt';
      const ic = document.createElement('span'); ic.className='ic-trash'; del.appendChild(ic);
      del.addEventListener('click', ()=>{
        if(!m.debts || !m.debts[idx]) return;
        const name = m.debts[idx].name || 'this debt';
        if(confirm(`Delete "${name}"?`)){
          m.debts.splice(idx,1);
          try{ saveData(); }catch(e){}
          try{ if(window.renderAll) window.renderAll(); }catch(e){}
        }
      });
      actions.appendChild(del);
      titleRow.appendChild(actions);
    });

    // Debt transactions (if present) — add delete link/button
    const txnWrap = document.getElementById('debtTransactions');
    if(txnWrap){
      txnWrap.querySelectorAll('.txn-row').forEach((row, ridx)=>{
        if(row.querySelector('.txn-delete')) return;
        const del = document.createElement('span'); del.className='txn-delete'; del.textContent='Delete';
        del.addEventListener('click', ()=>{
          const list = m.debtTransactions || [];
          if(list[ridx]){
            if(confirm('Delete this debt transaction?')){
              list.splice(ridx,1);
              try{ saveData(); }catch(e){}
              try{ if(window.renderAll) window.renderAll(); }catch(e){}
            }
          }
        });
        row.appendChild(del);
      });
    }
  }
  const _all = window.renderAll;
  window.renderAll = function(){ if(typeof _all==='function') _all(); wireDebts(); if(window.__renderSummary) window.__renderSummary(); };
  document.addEventListener('DOMContentLoaded', wireDebts);
  document.addEventListener('change', (e)=>{ if(e.target && e.target.id==='monthSelect') wireDebts(); });
})();



// v2.23.3: single source of truth for version
window.APP_VERSION = "v2.23.5";
window.applyAppVersion = function(){
  try{
    document.querySelectorAll('.app-version').forEach(el=>{ el.textContent = window.APP_VERSION; });
  }catch(e){}
};
document.addEventListener('DOMContentLoaded', window.applyAppVersion);
(function(){
  const _all = window.renderAll;
  window.renderAll = function(){ if(typeof _all==='function') _all(); window.applyAppVersion && window.applyAppVersion(); };
})();



// v2.23.5: sweep orphan kebabs, add robust debt delete + debt txn delete
(function(){
  function cur(){ const sel=document.getElementById('monthSelect'); return sel&&sel.value&&data.months?data.months[sel.value]:null; }

  function sweepKebabs(){
    document.querySelectorAll('.kebab').forEach(k=>{
      const hasMenu = !!k.querySelector('.kebab-menu');
      const btn = k.querySelector('.icon-btn');
      if(!hasMenu){
        k.classList.add('orphan');
        if(btn) btn.disabled = true;
        k.style.display = 'none';
      }
    });
  }

  function wireDebtDeletes(){
    const m = cur(); if(!m) return;
    const wrap = document.getElementById('debtCards'); if(!wrap) return;
    const cards = wrap.querySelectorAll('.card-item');
    cards.forEach((c, idx)=>{
      // Inject a dedicated delete button if not present
      if(!c.querySelector('.debt-del-btn')){
        let header = c.querySelector('.title-row') || c.querySelector('.card-head') || c;
        const btn = document.createElement('button');
        btn.className = 'icon-btn danger debt-del-btn';
        btn.title = 'Delete Debt';
        btn.innerHTML = '<span class="ic-trash" style="width:16px;height:16px;"></span>';
        btn.addEventListener('click', ()=>{
          if(!m.debts || !m.debts[idx]) return;
          const name = m.debts[idx].name || 'this debt';
          if(confirm(`Delete "${name}"?`)){
            m.debts.splice(idx,1);
            try{ saveData(); }catch(e){}
            try{ if(window.renderAll) window.renderAll(); }catch(e){}
          }
        });
        // Right side of header
        header.appendChild(btn);
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
      }
    });

    // If debt transactions are rendered, attach delete per row
    const txnLists = wrap.querySelectorAll('.debt-transactions, #debtTransactions');
    txnLists.forEach(list=>{
      list.querySelectorAll('.txn-row, .debt-txn-row').forEach((row, ridx)=>{
        if(row.querySelector('.txn-delete')) return;
        const del = document.createElement('span');
        del.className = 'txn-delete';
        del.textContent = 'Delete';
        del.style.marginLeft = '8px';
        del.addEventListener('click', ()=>{
          const arr = m.debtTransactions || m.debtTxns || [];
          if(arr[ridx]){
            if(confirm('Delete this debt transaction?')){
              arr.splice(ridx,1);
              // write back to the canonical field if needed
              if(m.debtTransactions) m.debtTransactions = arr;
              else if(m.debtTxns) m.debtTxns = arr;
              try{ saveData(); }catch(e){}
              try{ if(window.renderAll) window.renderAll(); }catch(e){}
            }
          }
        });
        row.appendChild(del);
      });
    });
  }

  const _oldAll = window.renderAll;
  window.renderAll = function(){
    if(typeof _oldAll === 'function') _oldAll();
    sweepKebabs();
    wireDebtDeletes();
    if(window.__renderSummary) window.__renderSummary();
  };
  document.addEventListener('DOMContentLoaded', ()=>{ sweepKebabs(); wireDebtDeletes(); });
  document.addEventListener('change', (e)=>{ if(e.target && e.target.id==='monthSelect'){ sweepKebabs(); wireDebtDeletes(); }});
})();
