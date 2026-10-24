/* ====== 1) Firebase config: nijer Firebase project er config ekhane boshao ====== */
const firebaseConfig = {
  apiKey: "AIzaSyBiUmUXCei3dOIf5SGQT1UX325G6XKJzIo",
  authDomain: "order-desk-1f568.firebaseapp.com",
  projectId: "order-desk-1f568",
  storageBucket: "order-desk-1f568.firebasestorage.app",
  messagingSenderId: "218522355353",
  appId: "1:218522355353:web:187bc0dadd22886e815a08"
};
/* ================================================================================ */

import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,createUserWithEmailAndPassword} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore,initializeFirestore,persistentLocalCache,persistentMultipleTabManager,terminate,clearIndexedDbPersistence,collection,doc,getDoc,setDoc,onSnapshot,query,orderBy,limit,serverTimestamp,writeBatch} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const configured = !firebaseConfig.apiKey.startsWith("PASTE");
let app, auth, db;
if (configured) {
  app = initializeApp(firebaseConfig); auth = getAuth(app);
  try { db = initializeFirestore(app, {localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})}); }
  catch (e) { db = getFirestore(app); }
}

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const taka = n => "৳" + Number(n || 0).toLocaleString("en-IN");
const dt = x => x?.toDate ? x.toDate() : (x ? new Date(x) : new Date());
const mkey = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
const fmt = x => dt(x).toLocaleString("en-GB", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"});
const STATUS = {pending:"Pending", processing:"In progress", delivered:"Delivered", cancelled:"Cancelled"};

const lsGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const SKEL = `<div class="orders">${'<div class="box o sk"></div>'.repeat(4)}</div>`;
let S = {user:null, profile:null, orders:[], users:[], loaded:false, synced:false, tab:(location.hash.slice(1) || lsGet("tab", "orders")), month:mkey(new Date()), filter:lsGet("filter", "all"), q:""};
let unsubs = [];
const isAdmin = () => S.profile?.role === "admin";

/* ---------- theme ---------- */
const savedTheme = localStorage.getItem("theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
document.documentElement.dataset.theme = savedTheme;
function toggleTheme() {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t; localStorage.setItem("theme", t);
}
const themeBtn = `<button class="btn sm" data-act="theme">Light / Dark</button>`;

function setLive(on) { const l = $("#live"); if (!l) return; l.className = "live " + (on ? "on" : "off"); l.textContent = on ? "● Live" : "● Offline"; }
addEventListener("online", () => setLive(true));
addEventListener("offline", () => setLive(false));
function toast(m) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = m;
  document.body.append(t); setTimeout(() => t.remove(), 2200);
}

/* ---------- auth flow ---------- */
if (!configured) {
  $("#app").innerHTML = `<div class="wrap"><div class="box" style="padding:16px"><b>Firebase config baki ache.</b><p>index.html er upore <code>firebaseConfig</code> e nijer Firebase project er value boshao. SETUP.md dekho.</p></div></div>`;
} else {
  onAuthStateChanged(auth, async u => {
    unsubs.forEach(f => f()); unsubs = [];
    S.loaded = false; S.synced = false; if (!u) S.orders = [];
    if (!u) { S.user = null; S.profile = null; renderLogin(); return; }
    S.user = u;
    try {
      const snap = await getDoc(doc(db, "users", u.uid));
      S.profile = snap.exists() ? snap.data() : null;
    } catch (e) { S.profile = null; }
    if (!S.profile || !["admin", "worker"].includes(S.profile.role)) { renderBlocked(); return; }
    subscribe(); renderShell();
  });
}

function subscribe() {
  unsubs.push(onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(1000)), snap => {
    const fresh = !snap.metadata.fromCache;
    if (S.synced && fresh) snap.docChanges().forEach(c => {
      if (c.type === "added" && !c.doc.metadata.hasPendingWrites) { const d = c.doc.data(); toast("Notun order: " + (d.orderNo ? "#" + d.orderNo : d.game)); }
    });
    if (fresh) S.synced = true;
    S.orders = snap.docs.map(d => ({id:d.id, ...d.data()})); S.loaded = true;
    setLive(fresh && navigator.onLine); renderView();
  }, e => toast("Orders load hoyni: " + e.code)));
  if (isAdmin()) unsubs.push(onSnapshot(collection(db, "users"), snap => {
    S.users = snap.docs.map(d => ({id:d.id, ...d.data()})); if (S.tab === "team") renderView();
  }));
}

/* ---------- login screen ---------- */
function renderLogin() {
  $("#app").innerHTML = `
  <div class="top"><h1>Order Desk</h1>${themeBtn}</div>
  <div class="login"><div class="box">
    <h2 style="margin:0 0 4px;font-size:20px">Sign in</h2>
    <form id="lf">
      <label for="em">Email</label><input id="em" type="email" required autocomplete="username">
      <label for="pw">Password</label><input id="pw" type="password" required autocomplete="current-password">
      <button class="btn pri" style="width:100%;margin-top:14px;padding:8px" type="submit">Sign in</button>
      <div class="err" id="le"></div>
    </form>
  </div></div>
  <div class="feed"><h2>Latest orders</h2><div class="box" id="feed"><div class="empty">Loading…</div></div></div>`;
  $("#lf").onsubmit = async e => {
    e.preventDefault(); $("#le").textContent = "";
    try { await signInWithEmailAndPassword(auth, $("#em").value.trim(), $("#pw").value); }
    catch (err) { $("#le").textContent = "Login hoyni (" + (err.code || "unknown") + "). Email ba password check koro."; }
  };
  unsubs.push(onSnapshot(query(collection(db, "publicFeed"), orderBy("at", "desc"), limit(8)), snap => {
    const f = $("#feed"); if (!f) return;
    f.innerHTML = snap.empty ? `<div class="empty">Ekhono kono order nei.</div>` :
      snap.docs.map(d => { const o = d.data();
        return `<div class="row"><span>${esc(o.game)} · ${esc(o.service)}</span><span><span class="badge s-${esc(o.status)}">${esc(STATUS[o.status] || o.status)}</span></span></div>`; }).join("");
  }, () => { const f = $("#feed"); if (f) f.innerHTML = `<div class="empty">Feed load hoyni.</div>`; }));
}

function renderBlocked() {
  $("#app").innerHTML = `<div class="top"><h1>Order Desk</h1>${themeBtn}<button class="btn sm" data-act="logout">Sign out</button></div>
  <div class="wrap"><div class="box" style="padding:16px"><b>Access nei.</b><p>Ei account e role set kora nei ba disable kora ache. Admin ke bolo tomar account e role dite.</p></div></div>`;
}

/* ---------- shell ---------- */
function renderShell() {
  const tabs = [["orders", "Orders"]].concat(isAdmin() ? [["dash", "Dashboard"], ["team", "Team"]] : []);
  if (!tabs.some(t => t[0] === S.tab)) S.tab = "orders";
  history.replaceState(null, "", "#" + S.tab);
  $("#app").innerHTML = `
  <div class="top"><h1>Order Desk</h1><span class="live ${navigator.onLine ? "on" : "off"}" id="live">${navigator.onLine ? "● Live" : "● Offline"}</span><span class="m">${esc(S.profile.name || S.user.email)} · ${esc(S.profile.role)}</span>${themeBtn}<button class="btn sm" data-act="logout">Sign out</button></div>
  <div class="wrap"><div class="tabs">${tabs.map(t => `<button class="tab ${S.tab === t[0] ? "on" : ""}" data-act="tab" data-v="${t[0]}">${t[1]}</button>`).join("")}</div><div id="view"></div></div>`;
  renderView();
}
function renderView() {
  if (!$("#view")) return;
  ({orders:viewOrders, dash:viewDash, team:viewTeam})[S.tab]();
}

/* ---------- orders ---------- */
function viewOrders() {
  if (!S.loaded) { $("#view").innerHTML = SKEL; return; }
  const keep = $("#q")?.value ?? S.q;
  const list = S.orders.filter(o =>
    (S.filter === "all" || o.status === S.filter) &&
    (!keep || [o.orderNo, o.customer, o.game, o.service, o.mail].join(" ").toLowerCase().includes(keep.toLowerCase())));
  $("#view").innerHTML = `
  <div class="bar">
    <input id="q" type="search" placeholder="Search order ID, customer, game, service" value="${esc(keep)}">
    <select id="sf">${["all", "pending", "processing", "delivered", "cancelled"].map(s => `<option value="${s}" ${S.filter === s ? "selected" : ""}>${s === "all" ? "All status" : STATUS[s]}</option>`).join("")}</select>
    ${isAdmin() ? `<button class="btn pri" data-act="new">New order</button>` : ""}
  </div>
  <div class="orders">${list.length ? list.map(orderCard).join("") : `<div class="empty box">Kono order nei.</div>`}</div>`;
  const q = $("#q"); q.oninput = () => { S.q = q.value; clearTimeout(q.t); q.t = setTimeout(() => { viewOrders(); const n = $("#q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  $("#sf").onchange = e => { S.filter = e.target.value; lsSet("filter", S.filter); viewOrders(); };
}
function orderCard(o) {
  const profit = (o.sell || 0) - (o.buy || 0);
  const creds = (o.mail || o.pass || o.link) ? `<div class="cred">
    ${o.mail ? `<div><span class="k">Mail</span><span>${esc(o.mail)}</span><button class="btn sm" data-act="copy" data-v="${esc(o.mail)}">Copy</button></div>` : ""}
    ${o.pass ? `<div><span class="k">Pass</span><span class="pw" data-pw="${esc(o.pass)}">••••••••</span><button class="btn sm" data-act="show">Show</button><button class="btn sm" data-act="copy" data-v="${esc(o.pass)}">Copy</button></div>` : ""}
    ${o.link ? `<div><span class="k">Link</span><a href="${esc(o.link)}" target="_blank" rel="noopener noreferrer">${esc(o.link)}</a><button class="btn sm" data-act="copy" data-v="${esc(o.link)}">Copy</button></div>` : ""}
  </div>` : "";
  const nums = isAdmin() ? `<div class="nums"><span>Buy ${taka(o.buy)}</span><span>Sell ${taka(o.sell)}</span><span class="${profit >= 0 ? "pos" : "neg"}">Profit ${taka(profit)}</span></div>` : "";
  let acts = "";
  if (o.status === "pending") acts += `<button class="btn blue" data-act="status" data-id="${o.id}" data-v="processing">Start</button>`;
  if (o.status === "processing") acts += `<button class="btn pri" data-act="status" data-id="${o.id}" data-v="delivered">Mark delivered</button>`;
  if (o.status === "pending" || o.status === "processing") acts += `<button class="btn danger" data-act="cancel" data-id="${o.id}">Cancel</button>`;
  if (o.status === "delivered" && isAdmin()) acts += `<button class="btn" data-act="status" data-id="${o.id}" data-v="processing">Reopen</button>`;
  if (o.status === "cancelled" && isAdmin()) acts += `<button class="btn" data-act="status" data-id="${o.id}" data-v="pending">Reopen</button>`;
  if (isAdmin()) acts += `<button class="btn" data-act="edit" data-id="${o.id}">Edit</button>`;
  return `<div class="box o">
    <div class="h"><b>${o.orderNo ? "#" + esc(o.orderNo) + " · " : ""}${esc(o.game)} · ${esc(o.service)}</b><span class="badge s-${esc(o.status)}">${esc(STATUS[o.status])}</span></div>
    <div class="m">${esc(o.customer)} · ${esc(o.type === "boost" ? "Boost" : "Purchase")} · ${fmt(o.createdAt)}${o.assignedName ? " · " + esc(o.assignedName) : ""}</div>
    ${creds}${o.note ? `<div class="m">${esc(o.note)}</div>` : ""}${o.status === "cancelled" ? `<div class="reason"><b>Cancelled${o.cancelledBy ? " by " + esc(o.cancelledBy) : ""}:</b> ${esc(o.cancelReason || "No reason given")}</div>` : ""}${nums}
    <div class="act">${acts}</div></div>`;
}

/* ---------- order form (admin) ---------- */
function openForm(o) {
  o = o || {type:"purchase"};
  const dlg = $("#dlg");
  dlg.innerHTML = `<form id="of">
    <h2 style="margin:0 0 8px;font-size:18px">${o.id ? "Edit order" : "New order"}</h2>
    <label>Order ID</label><input name="orderNo" required value="${esc(o.orderNo)}" placeholder="Jemon: A1024">
    <div class="two"><div><label>Customer</label><input name="customer" required value="${esc(o.customer)}"></div>
    <div><label>Type</label><select name="type"><option value="purchase" ${o.type === "purchase" ? "selected" : ""}>Purchase</option><option value="boost" ${o.type === "boost" ? "selected" : ""}>Boost</option></select></div></div>
    <div class="two"><div><label>Game</label><input name="game" required value="${esc(o.game)}"></div>
    <div><label>Service / item</label><input name="service" required value="${esc(o.service)}"></div></div>
    <div class="two"><div><label>Account mail</label><input name="mail" value="${esc(o.mail)}"></div>
    <div><label>Account password</label><input name="pass" value="${esc(o.pass)}"></div></div>
    <label>Link (boost)</label><input name="link" value="${esc(o.link)}">
    <div class="two"><div><label>Buy price (৳)</label><input name="buy" type="number" min="0" step="any" required value="${o.buy ?? ""}"></div>
    <div><label>Sell price (৳)</label><input name="sell" type="number" min="0" step="any" required value="${o.sell ?? ""}"></div></div>
    <label>Note</label><textarea name="note" rows="2">${esc(o.note)}</textarea>
    <div class="act" style="margin-top:14px"><button class="btn pri" type="submit">Save</button><button class="btn" type="button" data-act="close">Cancel</button></div>
  </form>`;
  dlg.showModal();
  $("#of").onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const data = {orderNo:f.orderNo.trim(), customer:f.customer.trim(), type:f.type, game:f.game.trim(), service:f.service.trim(), mail:f.mail.trim(), pass:f.pass, link:f.link.trim(), buy:Number(f.buy), sell:Number(f.sell), note:f.note.trim()};
    if (S.orders.some(x => x.id !== o.id && (x.orderNo || "").toLowerCase() === data.orderNo.toLowerCase())) { toast("Ei Order ID age theke ache"); return; }
    try {
      const b = writeBatch(db);
      if (o.id) {
        b.set(doc(db, "orders", o.id), data, {merge:true});
        b.set(doc(db, "publicFeed", o.id), {game:data.game, service:data.service}, {merge:true});
      } else {
        const ref = doc(collection(db, "orders"));
        b.set(ref, {...data, status:"pending", assignedTo:"", assignedName:"", createdAt:serverTimestamp(), deliveredAt:null});
        b.set(doc(db, "publicFeed", ref.id), {game:data.game, service:data.service, status:"pending", at:serverTimestamp()});
      }
      await b.commit(); dlg.close(); toast("Saved");
    } catch (err) { toast("Save hoyni: " + err.code); }
  };
}
async function setStatus(id, status) {
  try {
    const b = writeBatch(db);
    const upd = status === "pending"
      ? {status, assignedTo:"", assignedName:"", deliveredAt:null, cancelReason:"", cancelledBy:"", cancelledAt:null}
      : {status, assignedTo:S.user.uid, assignedName:S.profile.name || S.user.email, deliveredAt:status === "delivered" ? serverTimestamp() : null};
    b.set(doc(db, "orders", id), upd, {merge:true});
    b.set(doc(db, "publicFeed", id), {status}, {merge:true});
    await b.commit();
  } catch (err) { toast("Update hoyni: " + err.code); }
}

function openCancel(id) {
  const o = S.orders.find(x => x.id === id), dlg = $("#dlg");
  dlg.innerHTML = `<form id="cf"><h2 style="margin:0 0 8px;font-size:18px">Cancel order ${o.orderNo ? "#" + esc(o.orderNo) : ""}</h2>
    <label>Reason (admin will see this)</label><textarea name="reason" rows="3" required placeholder="Keno cancel korcho?"></textarea>
    <div class="act" style="margin-top:14px"><button class="btn pri" style="background:var(--bad);border-color:var(--bad)" type="submit">Cancel order</button><button class="btn" type="button" data-act="close">Back</button></div></form>`;
  dlg.showModal();
  $("#cf").onsubmit = async e => {
    e.preventDefault();
    const reason = String(new FormData(e.target).get("reason") || "").trim(); if (!reason) return;
    try {
      const b = writeBatch(db);
      b.set(doc(db, "orders", id), {status:"cancelled", cancelReason:reason, cancelledBy:S.profile.name || S.user.email, cancelledAt:serverTimestamp(), deliveredAt:null}, {merge:true});
      b.set(doc(db, "publicFeed", id), {status:"cancelled"}, {merge:true});
      await b.commit(); dlg.close(); toast("Order cancelled");
    } catch (err) { toast("Hoyni: " + err.code); }
  };
}

/* ---------- dashboard (admin) ---------- */
function monthOrders() { return S.orders.filter(o => mkey(dt(o.createdAt)) === S.month); }
function viewDash() {
  if (!S.loaded) { $("#view").innerHTML = SKEL; return; }
  const all = monthOrders(), done = all.filter(o => o.status === "delivered"), canc = all.filter(o => o.status === "cancelled");
  const rev = done.reduce((a, o) => a + (o.sell || 0), 0), cost = done.reduce((a, o) => a + (o.buy || 0), 0);
  const byW = {}; done.forEach(o => { const n = o.assignedName || "Unassigned"; byW[n] = (byW[n] || 0) + 1; });
  $("#view").innerHTML = `
  <div class="bar"><input type="month" id="mo" value="${S.month}" style="width:auto"><button class="btn" data-act="csv">Export CSV</button></div>
  <div class="stats">
    <div class="box stat"><div class="v">${all.length}</div><div class="l">Orders this month</div></div>
    <div class="box stat"><div class="v">${done.length}</div><div class="l">Delivered</div></div>
    <div class="box stat"><div class="v">${all.length - done.length - canc.length}</div><div class="l">Not delivered yet</div></div>
    <div class="box stat"><div class="v neg">${canc.length}</div><div class="l">Cancelled</div></div>
    <div class="box stat"><div class="v">${taka(rev)}</div><div class="l">Sell total (delivered)</div></div>
    <div class="box stat"><div class="v">${taka(cost)}</div><div class="l">Buy total (delivered)</div></div>
    <div class="box stat"><div class="v ${rev - cost >= 0 ? "pos" : "neg"}">${taka(rev - cost)}</div><div class="l">Profit</div></div>
  </div>
  ${Object.keys(byW).length ? `<p class="m">Delivered by: ${Object.entries(byW).map(([n, c]) => `${esc(n)} (${c})`).join(", ")}</p>` : ""}
  <div class="box scroll"><table><thead><tr><th>Date</th><th>Order ID</th><th>Customer</th><th>Game / service</th><th>Buy</th><th>Sell</th><th>Profit</th><th>By</th></tr></thead><tbody>
  ${done.length ? done.map(o => `<tr><td>${fmt(o.deliveredAt || o.createdAt)}</td><td>${esc(o.orderNo)}</td><td>${esc(o.customer)}</td><td>${esc(o.game)} · ${esc(o.service)}</td><td>${taka(o.buy)}</td><td>${taka(o.sell)}</td><td>${taka((o.sell || 0) - (o.buy || 0))}</td><td>${esc(o.assignedName)}</td></tr>`).join("") : `<tr><td colspan="8" class="empty">Ei mashe kono delivered order nei.</td></tr>`}
  </tbody></table></div>
  ${canc.length ? `<h3 style="margin:20px 0 8px;font-size:14px">Cancelled orders</h3><div class="box scroll"><table><thead><tr><th>Order ID</th><th>Customer</th><th>Game / service</th><th>Cancelled by</th><th>Reason</th></tr></thead><tbody>${canc.map(o => `<tr><td>${esc(o.orderNo)}</td><td>${esc(o.customer)}</td><td>${esc(o.game)} · ${esc(o.service)}</td><td>${esc(o.cancelledBy)}</td><td>${esc(o.cancelReason)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  $("#mo").onchange = e => { if (e.target.value) { S.month = e.target.value; viewDash(); } };
}
function exportCsv() {
  const done = monthOrders().filter(o => o.status === "delivered");
  const rows = [["Date", "Order ID", "Customer", "Game", "Service", "Buy", "Sell", "Profit", "Delivered by"]]
    .concat(done.map(o => [dt(o.deliveredAt || o.createdAt).toISOString().slice(0, 10), o.orderNo, o.customer, o.game, o.service, o.buy, o.sell, (o.sell || 0) - (o.buy || 0), o.assignedName]));
  const csv = rows.map(r => r.map(c => '"' + String(c ?? "").replace(/"/g, '""') + '"').join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], {type:"text/csv"})); a.download = `delivery-${S.month}.csv`; a.click();
}

/* ---------- team (admin) ---------- */
function viewTeam() {
  $("#view").innerHTML = `
  <div class="box" style="padding:12px;margin-bottom:16px"><b>Add worker</b>
    <form id="wf"><div class="two"><div><label>Name</label><input name="name" required></div><div><label>Email</label><input name="email" type="email" required></div></div>
    <label>Password (min 6)</label><input name="pw" type="text" minlength="6" required>
    <button class="btn pri" style="margin-top:12px" type="submit">Create worker</button><div class="err" id="we"></div></form></div>
  <div class="box scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead><tbody>
  ${S.users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${u.role === "worker" ? `<button class="btn sm danger" data-act="role" data-id="${u.id}" data-v="disabled">Disable</button>` : u.role === "disabled" ? `<button class="btn sm" data-act="role" data-id="${u.id}" data-v="worker">Enable</button>` : ""}</td></tr>`).join("")}
  </tbody></table></div>`;
  $("#wf").onsubmit = async e => {
    e.preventDefault(); $("#we").textContent = "";
    const f = Object.fromEntries(new FormData(e.target));
    try {
      const sec = initializeApp(firebaseConfig, "secondary-" + Date.now());
      const cred = await createUserWithEmailAndPassword(getAuth(sec), f.email.trim(), f.pw);
      await setDoc(doc(db, "users", cred.user.uid), {name:f.name.trim(), email:f.email.trim(), role:"worker"});
      await signOut(getAuth(sec)); e.target.reset(); toast("Worker created");
    } catch (err) { $("#we").textContent = "Hoyni: " + err.code; }
  };
}

/* ---------- clicks ---------- */
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act, id = b.dataset.id, v = b.dataset.v;
  if (a === "theme") toggleTheme();
  else if (a === "logout") { try { await signOut(auth); await terminate(db); await clearIndexedDbPersistence(db); } catch (e) {} location.reload(); }
  else if (a === "tab") { S.tab = v; lsSet("tab", v); history.replaceState(null, "", "#" + v); renderShell(); }
  else if (a === "new") openForm();
  else if (a === "edit") openForm(S.orders.find(o => o.id === id));
  else if (a === "close") $("#dlg").close();
  else if (a === "cancel") openCancel(id);
  else if (a === "status") { b.disabled = true; await setStatus(id, v); b.disabled = false; }
  else if (a === "csv") exportCsv();
  else if (a === "copy") { try { await navigator.clipboard.writeText(v); toast("Copied"); } catch { toast("Copy hoyni"); } }
  else if (a === "show") { const s = b.parentElement.querySelector(".pw"); const open = b.textContent === "Hide"; s.textContent = open ? "••••••••" : s.dataset.pw; b.textContent = open ? "Show" : "Hide"; }
  else if (a === "role") { try { await setDoc(doc(db, "users", id), {role:v}, {merge:true}); } catch (err) { toast("Hoyni: " + err.code); } }
});
