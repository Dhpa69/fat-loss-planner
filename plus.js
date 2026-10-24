/* Fat-Loss Planner v2 "Plus" layer: Today dashboard, food logging, Pro (one-time + 7-day free trial),
   cloud sync (Supabase, RLS), Apple Health (iOS), reminders, streaks, trend line, weekly check-in, personalization.
   Original planner data (fatLossPlanner.v1 / fatLossPlanner.workouts.v1) is read as-is and never reformatted. */
(function(){
'use strict';
var VER='2.1.0',PK='fatLossPlanner.plus.v1',DAY=864e5,LB=2.2046226;
var PRO_ID='com.dhavalpatel.fatlossplanner.pro',TRIAL_ID='com.dhavalpatel.fatlossplanner.trial7',TRIAL_DAYS=7,PRICE='$9.99';
var SB_URL='https://etfhuwopqjderqutlyhk.supabase.co',SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Zmh1d29wcWpkZXJxdXRseWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5ODY4NjAsImV4cCI6MjEwNzU2Mjg2MH0.nVq3VqCYn3fRByCUle0u8_4almvp31oafR4LaHrE7TA';
var SITE='https://dhpa69.github.io/fat-loss-planner/';
var CAP=window.Capacitor,NATIVE=!!(CAP&&CAP.isNativePlatform&&CAP.isNativePlatform());
function PL(n){return NATIVE&&CAP.Plugins?CAP.Plugins[n]:null;}
function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function today(o){var d=new Date(Date.now()+(o||0)*DAY);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dOf(t){var d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function tOf(ds){return new Date(ds+'T12:00:00').getTime();}
function r0(x){return Math.round(x||0);}
function r1(x){return Math.round((x||0)*10)/10;}
function toast(m){var t=$('pToast');t.textContent=m;t.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(function(){t.classList.remove('on');},2600);}

// ---------- state + migration ----------
var DEFP={v:2,food:{},favs:[],meals:[],recent:[],set:{eds:false,bsf:false,strengthProt:false,remind:{weigh:'07:30',meals:'19:30',on:false},health:false},
  checkins:[],pro:{owned:false,trialStart:null,trialUsed:false},updatedAt:0,lastCheckin:null};
function normP(p){var ex=p&&{role:p.role||null,coachWorkout:p.coachWorkout||null,coachTargets:p.coachTargets||null,coachAccepted:p.coachAccepted||null,health:p.health||null,healthAt:p.healthAt||0};var d=JSON.parse(JSON.stringify(DEFP));if(!p||typeof p!=='object')return d;
  if(p.food&&typeof p.food==='object')d.food=p.food;['favs','meals','recent','checkins'].forEach(function(k){if(Array.isArray(p[k]))d[k]=p[k];});
  if(p.set)d.set=Object.assign(d.set,p.set,{remind:Object.assign(d.set.remind,(p.set||{}).remind||{})});
  if(p.pro)d.pro=Object.assign(d.pro,p.pro);d.updatedAt=+p.updatedAt||0;d.lastCheckin=p.lastCheckin||null;return Object.assign(d,ex);}
var P;try{P=normP(JSON.parse(localStorage.getItem(PK)));}catch(e){P=normP(null);}
(function migrate(){ // one-time safety copy of the original data before v2 ever writes anything
  try{if(!localStorage.getItem('fatLossPlanner.backup.preV2')){var b={at:new Date().toISOString(),v1:localStorage.getItem('fatLossPlanner.v1'),workouts:localStorage.getItem('fatLossPlanner.workouts.v1')};
    localStorage.setItem('fatLossPlanner.backup.preV2',JSON.stringify(b));}}catch(e){}
  if(!localStorage.getItem(PK))savePlocal();
})();
function savePlocal(){try{localStorage.setItem(PK,JSON.stringify(P));}catch(e){}}
function saveP(){P.updatedAt=Date.now();savePlocal();queueSync();if(typeof coachPublish==='function')coachPublish();}
function S(){return window.__FLP?window.__FLP.state:null;}
function M(){try{return window.__FLP.compute();}catch(e){return null;}}
function W(){return window.__FLW?window.__FLW.state():null;}

// ---------- Pro / trial ----------
function trialLeft(){if(!P.pro.trialStart)return 0;var left=TRIAL_DAYS-(Date.now()-P.pro.trialStart)/DAY;return left>0?Math.ceil(left):0;}
var WEB_PRO=!NATIVE; // website (GitHub) version: all Pro features unlocked for testing
function isPro(){return WEB_PRO||!!P.pro.owned||trialLeft()>0;}
function proLabel(){return WEB_PRO?'Pro ✓ (website — all unlocked)':P.pro.owned?'Pro ✓':trialLeft()>0?'Trial: '+trialLeft()+' day'+(trialLeft()===1?'':'s')+' left':'Free';}
var NP=PL('NativePurchases'),products={};
function loadProducts(){if(!NP)return;NP.getProducts({productIdentifiers:[PRO_ID,TRIAL_ID],productType:'inapp'}).then(function(r){(r.products||[]).forEach(function(p){products[p.identifier]=p;});renderPaywall();}).catch(function(){});}
function applyPurchases(list){var ch=false;(list||[]).forEach(function(p){var id=p.productIdentifier||p.productId;
  if(id===PRO_ID&&!P.pro.owned){P.pro.owned=true;ch=true;}
  if(id===TRIAL_ID){var t=+new Date(p.purchaseDate||p.originalPurchaseDate||p.transactionDate||0)||null;
    if(t&&(!P.pro.trialStart||t<P.pro.trialStart)){P.pro.trialStart=t;ch=true;} if(!P.pro.trialStart){P.pro.trialStart=Date.now();ch=true;} P.pro.trialUsed=true;}});
  if(ch){saveP();pushTrial();renderAll();}}
function buy(id){if(!NP){upsellWeb();return;}toast('Contacting the App Store…');
  NP.purchaseProduct({productIdentifier:id,productType:'inapp',quantity:1}).then(function(t){
    if(id===PRO_ID)P.pro.owned=true;else{P.pro.trialStart=P.pro.trialStart||Date.now();P.pro.trialUsed=true;}
    saveP();pushTrial();closeSheet();renderAll();toast(id===PRO_ID?'Pro unlocked forever 🎉':'Your 7-day free trial has started');
  }).catch(function(e){toast('Purchase not completed');});}
function restore(){if(!NP){upsellWeb();return;}toast('Restoring…');
  (NP.restorePurchases?NP.restorePurchases():Promise.resolve()).catch(function(){}).then(function(){return NP.getPurchases({productType:'inapp'});})
  .then(function(r){applyPurchases(r.purchases||[]);toast(P.pro.owned?'Pro restored':'Purchases restored');}).catch(function(){toast('Nothing to restore');});}
function upsellWeb(){openSheet('<h3>Available in the iPhone app</h3><p>Barcode scanning, Apple Health sync, cloud sync, the weekly smart calorie check-in, joint-friendly and blood-sugar-friendly modes and advanced stats are part of <b>Pro</b> in the Fat-Loss Planner iPhone app (free download, 7-day free trial, then a one-time '+PRICE+' — no subscription, no ads).</p><p class="hint">Everything you already use on this website stays free.</p><button class="pri wide" data-close>OK</button>');}
function needPro(what){if(isPro())return true;if(!NATIVE){upsellWeb();return false;}openPaywall(what);return false;}
function priceOf(id,def){var p=products[id];return p&&(p.priceString||p.localizedPrice)||def;}
function openPaywall(what){openSheet('<div id="paywall"></div>');renderPaywall(what);}
function renderPaywall(what){var el=$('paywall');if(!el)return;var used=P.pro.trialUsed||P.pro.trialStart;
  el.innerHTML='<h3>⭐ Fat-Loss Planner Pro</h3>'+(what?'<p><b>'+esc(what)+'</b> is a Pro feature.</p>':'')+
  '<ul class="plist"><li>📷 Barcode scanning</li><li>❤️ Apple Health sync (weight, steps, workouts, active energy)</li><li>☁️ Cloud sync &amp; backup</li><li>🧭 Weekly smart calorie check-in</li><li>🦴 Joint-friendly (EDS) &amp; 🩸 blood-sugar-friendly modes</li><li>📊 Advanced stats</li></ul>'+
  (P.pro.owned?'<p class="ok">You own Pro. Thank you!</p>':
   (!used?'<button class="pri wide" id="pwTrial">Try Pro free for 7 days</button><div class="hint c">Free — no payment info, no automatic charge. After 7 days Pro features lock again and all your data is kept.</div>':
    (trialLeft()>0?'<p class="ok">Free trial: '+trialLeft()+' day(s) left. When it ends, Pro features lock (no charge) and your data is kept.</p>':'<p class="hint">Your free trial has ended. Your data is safe — unlock Pro to use these features again.</p>'))+
   '<button class="pri wide gold" id="pwBuy">Unlock Pro forever '+esc(priceOf(PRO_ID,PRICE))+'</button><div class="hint c">One-time purchase. No subscription. No ads.</div>')+
  '<button class="wide" id="pwRestore">Restore Purchases</button><button class="wide ghost" data-close>Not now</button>';
  if($('pwTrial'))$('pwTrial').onclick=function(){buy(TRIAL_ID);};if($('pwBuy'))$('pwBuy').onclick=function(){buy(PRO_ID);};$('pwRestore').onclick=restore;}

// ---------- sheet ----------
function openSheet(html){$('pSheetBody').innerHTML=html;$('pSheet').classList.add('on');}
function closeSheet(){$('pSheet').classList.remove('on');stopScan();}

// ---------- food ----------
function dayFood(d){return P.food[d]||[];}
function totals(d){var t={kcal:0,p:0,c:0,f:0,fib:0};dayFood(d).forEach(function(x){var q=x.qty||1;t.kcal+=x.kcal*q;t.p+=(x.p||0)*q;t.c+=(x.c||0)*q;t.f+=(x.f||0)*q;t.fib+=(x.fib||0)*q;});return t;}
function targets(){var m=M()||{},s=S()||{profile:{}},pr=s.profile||{};
  var t={kcal:m.kcal||2000,p:m.prot||150,c:m.carb||200,f:m.fat||65,fib:m.fiber||30};
  if(P.coachTargets&&P.coachAccepted){var ct=P.coachTargets;if(ct.p)t.p=ct.p;if(ct.c)t.c=ct.c;if(ct.f)t.f=ct.f;if(ct.fib)t.fib=ct.fib;}
  if(P.set.strengthProt){var kg=(pr.weightLb||180)/LB;t.p=Math.max(t.p,Math.round(kg*1.8));}
  if(P.set.bsf&&isPro()){t.c=Math.min(t.c,Math.round(t.kcal*0.35/4));t.fib=Math.max(t.fib,35);}
  return t;}
var curDay=today();
function addFood(it,d){d=d||curDay;var x={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:it.name||'Food',kcal:+it.kcal||0,p:+it.p||0,c:+it.c||0,f:+it.f||0,fib:+it.fib||0,qty:+it.qty||1,meal:it.meal||mealNow(),code:it.code||null};
  (P.food[d]=P.food[d]||[]).push(x);
  var key=x.name.toLowerCase();P.recent=[Object.assign({},x,{qty:1})].concat(P.recent.filter(function(r){return r.name.toLowerCase()!==key;})).slice(0,25);
  saveP();renderAll();toast('Added '+x.name);}
function mealNow(){var h=new Date().getHours();return h<10?'Breakfast':h<15?'Lunch':h<21?'Dinner':'Snack';}
function offToItem(p){var n=p.nutriments||{},g=parseFloat(p.serving_quantity)||100,f=g/100;
  var kcal=n['energy-kcal_serving']||(n['energy-kcal_100g']!=null?n['energy-kcal_100g']*f:(n['energy_100g']||0)/4.184*f);
  return {name:(p.product_name||p.generic_name||'Unnamed product')+(p.brands?' · '+p.brands.split(',')[0]:''),serving:p.serving_size||(g+' g'),
    kcal:r0(kcal),p:r1(n.proteins_serving!=null?n.proteins_serving:(n.proteins_100g||0)*f),c:r1(n.carbohydrates_serving!=null?n.carbohydrates_serving:(n.carbohydrates_100g||0)*f),
    f:r1(n.fat_serving!=null?n.fat_serving:(n.fat_100g||0)*f),fib:r1(n.fiber_serving!=null?n.fiber_serving:(n.fiber_100g||0)*f),code:p.code||null};}
function lookupBarcode(code){code=String(code||'').replace(/\D/g,'');if(code.length<6){toast('That barcode looks too short');return;}
  $('fResults').innerHTML='<div class="hint">Looking up '+esc(code)+'…</div>';
  fetch('https://world.openfoodfacts.org/api/v2/product/'+code+'.json?fields=code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments').then(function(r){return r.json();})
  .then(function(j){if(j&&j.status===1&&j.product){j.product.code=code;showResults([offToItem(j.product)]);}else $('fResults').innerHTML='<div class="hint">Not found in Open Food Facts. Use Quick add below.</div>';})
  .catch(function(){$('fResults').innerHTML='<div class="hint">No connection — try Quick add.</div>';});}
var COMMON=[['Egg, large',72,6.3,0.4,4.8,0],['Chicken breast, cooked 4 oz',187,35,0,4,0],['Greek yogurt, nonfat 170 g',100,17,6,0.7,0],['Oatmeal, cooked 1 cup',166,6,28,3.6,4],['Banana, medium',105,1.3,27,0.4,3.1],['Apple, medium',95,0.5,25,0.3,4.4],['Brown rice, cooked 1 cup',218,4.5,46,1.6,3.5],['White rice, cooked 1 cup',205,4.3,45,0.4,0.6],['Salmon, cooked 4 oz',233,25,0,14,0],['Broccoli, 1 cup',31,2.5,6,0.3,2.4],['Whey protein, 1 scoop',120,24,3,1.5,0],['Almonds, 1 oz',164,6,6,14,3.5],['Avocado, half',120,1.5,6,11,5],['Black beans, ½ cup',114,7.6,20,0.5,7.5],['Whole-wheat bread, 1 slice',80,4,14,1,2],['Peanut butter, 2 tbsp',190,7,7,16,2],['Milk, 2% 1 cup',122,8,12,4.8,0],['Lentils, cooked ½ cup',115,9,20,0.4,8],['Sweet potato, medium',103,2.3,24,0.2,3.8],['Cottage cheese, low-fat ½ cup',90,12,5,2.5,0],['Roti / chapati',120,3,18,3.7,2],['Dal, 1 cup',230,12,32,6,8],['Paneer, 100 g',265,18,1.2,21,0],['Tofu, firm 100 g',144,17,3,9,2]].map(function(a){return {name:a[0],kcal:a[1],p:a[2],c:a[3],f:a[4],fib:a[5]};});
var lastResults=[],FDC_KEY='DEMO_KEY'; // free USDA FoodData Central key; replace with a personal key from api.data.gov for higher limits
function fdcToItem(f){var N={};(f.foodNutrients||[]).forEach(function(n){N[n.nutrientNumber||n.nutrientId]=n.value;});var g=(f.servingSize&&/^g|grm$/i.test(f.servingSizeUnit||''))?f.servingSize:100,k=g/100;
  var nm=(f.description||'Food').toLowerCase().replace(/(^|[ ,(])\w/g,function(c){return c.toUpperCase();});
  return {name:nm+(f.brandName||f.brandOwner?' · '+(f.brandName||f.brandOwner):''),serving:f.householdServingFullText||(g+' g'),kcal:r0((N['208']||N['1008']||(N['268']||0)/4.184)*k),p:r1((N['203']||N['1003']||0)*k),c:r1((N['205']||N['1005']||0)*k),f:r1((N['204']||N['1004']||0)*k),fib:r1((N['291']||N['1079']||0)*k)};}
function showResults(list){lastResults=list;$('fResults').innerHTML=list.length?list.map(function(x,i){return '<div class="fitem"><div class="fn"><b>'+esc(x.name)+'</b><div class="hint">'+(x.serving?esc(x.serving)+' · ':'')+r0(x.kcal)+' kcal · P '+r0(x.p)+' · C '+r0(x.c)+' · F '+r0(x.f)+'</div></div><button class="sm" data-fav-res="'+i+'" aria-label="Save as favorite">☆</button><button class="sm pri" data-add-res="'+i+'">Add</button></div>';}).join(''):'<div class="hint">No matches. Try another word or Quick add.</div>';}
var sTimer;
function search(q){q=q.trim();if(!q){showResults(P.recent.slice(0,8));return;}
  var lq=q.toLowerCase(),loc=P.favs.concat(P.recent,COMMON).filter(function(x){return x.name.toLowerCase().indexOf(lq)>=0;});
  var seen={};loc=loc.filter(function(x){var k=x.name.toLowerCase();if(seen[k])return false;seen[k]=1;return true;}).slice(0,8);showResults(loc);
  if(/^\d{8,14}$/.test(q)){lookupBarcode(q);return;}
  if(q.length<3)return;clearTimeout(sTimer);sTimer=setTimeout(function(){
    fetch('https://api.nal.usda.gov/fdc/v1/foods/search?api_key='+FDC_KEY+'&pageSize=15&dataType=Foundation,SR%20Legacy,Branded&query='+encodeURIComponent(q))
    .then(function(r){return r.json();}).then(function(j){if($('fSearch').value.trim()!==q)return;var on=(j.foods||[]).map(fdcToItem).filter(function(x){return x.kcal>0;});showResults(loc.concat(on).slice(0,20));}).catch(function(){});},450);}
// barcode scanning (Pro): native plugin on iPhone, BarcodeDetector in supporting browsers
var scanStream=null;
function stopScan(){if(scanStream){scanStream.getTracks().forEach(function(t){t.stop();});scanStream=null;}}
function scan(){if(!needPro('Barcode scanning'))return;var BS=PL('CapacitorBarcodeScanner');
  if(BS){BS.scanBarcode({hint:17,scanInstructions:'Point at the barcode',scanButton:false}).then(function(r){if(r&&r.ScanResult)lookupBarcode(r.ScanResult);}).catch(function(){});return;}
  if(!('BarcodeDetector' in window)||!navigator.mediaDevices){toast('Camera scanning is not supported in this browser — type the barcode number instead');return;}
  openSheet('<h3>Scan a barcode</h3><video id="scanV" playsinline muted style="width:100%;border-radius:12px;background:#000"></video><button class="wide" data-close>Cancel</button>');
  var det=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e']});
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(function(s){scanStream=s;var v=$('scanV');v.srcObject=s;v.play();
    (function loop(){if(!scanStream)return;det.detect(v).then(function(c){if(c.length){var code=c[0].rawValue;closeSheet();lookupBarcode(code);}else requestAnimationFrame(loop);}).catch(function(){requestAnimationFrame(loop);});})();
  }).catch(function(){closeSheet();toast('Camera permission was not given');});}

// ---------- weight / trend ----------
function logs(){var s=S();return s?s.logs.slice().sort(function(a,b){return a.date<b.date?-1:1;}):[];}
function trend(){var L=logs(),out=[],k=0.1,ema=null; // exponentially smoothed trend (like a 10-day moving average)
  L.forEach(function(l,i){if(ema==null)ema=l.wLb;else{var gap=Math.max(1,(tOf(l.date)-tOf(L[i-1].date))/DAY);var a=1-Math.pow(1-k,gap);ema=ema+a*(l.wLb-ema);}out.push({date:l.date,w:l.wLb,t:ema});});return out;}
function unit(){var s=S();return s&&s.profile.wUnit==='kg'?'kg':'lb';}
function fw(lb){return lb==null?'—':(unit()==='kg'?lb/LB:lb).toFixed(1)+' '+unit();}
function drawTrend(cv,pts){if(!cv)return;var dpr=window.devicePixelRatio||1,w=cv.clientWidth||320,h=160;cv.width=w*dpr;cv.height=h*dpr;var x=cv.getContext('2d');x.scale(dpr,dpr);x.clearRect(0,0,w,h);
  var cs=getComputedStyle(document.documentElement);if(pts.length<2){x.fillStyle=cs.getPropertyValue('--muted');x.font='13px -apple-system,sans-serif';x.fillText('Log 2+ weigh-ins to see your trend line',10,h/2);return;}
  pts=pts.slice(-60);var ys=pts.map(function(p){return p.w;}).concat(pts.map(function(p){return p.t;})),mn=Math.min.apply(0,ys)-1,mx=Math.max.apply(0,ys)+1,t0=tOf(pts[0].date),t1=tOf(pts[pts.length-1].date)||t0+1;
  function X(d){return 8+(tOf(d)-t0)/Math.max(1,t1-t0)*(w-16);}function Y(v){return 10+(mx-v)/(mx-mn)*(h-24);}
  x.fillStyle=cs.getPropertyValue('--muted');pts.forEach(function(p){x.beginPath();x.arc(X(p.date),Y(p.w),2.5,0,7);x.fill();});
  x.strokeStyle=cs.getPropertyValue('--acc');x.lineWidth=3;x.beginPath();pts.forEach(function(p,i){i?x.lineTo(X(p.date),Y(p.t)):x.moveTo(X(p.date),Y(p.t));});x.stroke();
  x.fillStyle=cs.getPropertyValue('--muted');x.font='11px -apple-system,sans-serif';x.fillText(fw(mx-1),8,10);x.fillText(fw(mn+1),8,h-4);}
function weeklyRate(){var T=trend();if(T.length<2)return null;var last=T[T.length-1],cut=tOf(last.date)-7*DAY,prev=null;for(var i=T.length-1;i>=0;i--){if(tOf(T[i].date)<=cut){prev=T[i];break;}}
  if(!prev){prev=T[0];if(tOf(last.date)-tOf(prev.date)<5*DAY)return null;}return (prev.t-last.t)/((tOf(last.date)-tOf(prev.date))/DAY)*7;}

// ---------- streaks ----------
function activeDay(d){var s=S(),w=W();if(dayFood(d).length)return true;if(s&&s.logs.some(function(l){return l.date===d;}))return true;
  if(w&&w.log&&w.log[d]){var L=w.log[d];for(var k in L){var ex=(L[k]&&L[k].ex)||[];for(var j=0;j<ex.length;j++){if((ex[j].sets||[]).some(function(x){return x.d;}))return true;}}}return false;}
function streak(){var n=0,i=activeDay(today())?0:1;for(;i<400;i++){if(activeDay(today(-i)))n++;else break;}return n;}
function best(){var b=0,c=0;for(var i=365;i>=0;i--){if(activeDay(today(-i))){c++;b=Math.max(b,c);}else c=0;}return b;}

// ---------- EDS swaps ----------
var SWAPS={'Back Squat':'Box Squat to a bench (controlled, partial depth) or Leg Press','Front Squat':'Goblet Squat to a box','Deadlift':'Trap-bar or Kettlebell Deadlift from blocks','Romanian Deadlift':'Hip Thrust / Glute Bridge','Bench Press':'Machine Chest Press (neutral grip)','Incline Dumbbell Press':'Incline Machine Press','Dumbbell Bench Press':'Floor Press (limits shoulder range)','Overhead Press':'Landmine Press','Seated Dumbbell Press':'Landmine Press','Barbell Row':'Chest-Supported Machine Row','Pull-up':'Lat Pulldown (neutral grip)','Walking Lunge':'Step-up to a low box','Hanging Knee Raise':'Dead Bug','Plank':'Dead Bug or Bird Dog','Leg Press':'Leg Press (stop short of locking knees)','Lateral Raise':'Cable Lateral Raise, light, to shoulder height','Dips':'Triceps Pushdown','Box Jump':'Step-up','Burpee':'Low-impact Step-back Burpee','Jump Rope':'Marching / Bike intervals','Running':'Cycling or Elliptical','Kettlebell Swing':'Cable Pull-through','Overhead Triceps Extension':'Triceps Pushdown (rope)'};
function todaysExercises(){var w=W();if(!w||!window.__FLW)return [];var dow=(new Date().getDay()+6)%7,ids=(w.tpl[dow]||[]).concat((w.extra&&w.extra[today()])||[]);
  var lib=(window.__FLW.lib||[]).concat(w.custom||[]),names=[];ids.forEach(function(id){var r=lib.filter(function(x){return x.id===id;})[0];if(r)(r.ex||[]).forEach(function(e){if(names.indexOf(e.n)<0)names.push(e.n);});});return names;}

// ---------- cloud sync ----------
var sb=null,user=null,syncT=null,syncing=false;
try{if(window.supabase&&supabase.createClient)sb=supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:!NATIVE,flowType:'pkce',storageKey:'flp.sb'}});}catch(e){}
function snapshot(){var s=S();return {v:2,app:'fat-loss-planner',nutrition:s?JSON.parse(JSON.stringify(s)):null,workouts:window.__FLW?window.__FLW.get():null,plus:(function(){var c=JSON.parse(JSON.stringify(P));delete c.health;delete c.healthAt;return c;})(),at:Date.now()};} // Apple Health data never leaves the device
function canSync(){return !!(sb&&user&&isPro());}
function queueSync(){if(!canSync())return;clearTimeout(syncT);syncT=setTimeout(push,1500);}
function push(){if(!canSync()||syncing)return;syncing=true;var snap=snapshot();
  sb.from('flp_data').upsert({user_id:user.id,data:snap,updated_at:new Date(snap.at).toISOString()}).then(function(r){syncing=false;setSync(r.error?'Sync error: '+r.error.message:'Synced '+new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}));});}
function pull(){if(!sb||!user)return Promise.resolve();
  return sb.from('flp_data').select('data,updated_at').eq('user_id',user.id).maybeSingle().then(function(r){
    if(r.error){setSync('Cloud not ready: '+r.error.message);return;}
    var cloud=r.data&&r.data.data;var localAt=Math.max(P.updatedAt||0,+localStorage.getItem('flp.localEditAt')||0);
    if(cloud&&cloud.at>localAt&&cloud.nutrition){
      if(confirm('Load your cloud data from '+new Date(cloud.at).toLocaleString()+'? (This device\'s data will be replaced; a backup copy is kept.)')){
        try{localStorage.setItem('fatLossPlanner.backup.beforeCloud',JSON.stringify(snapshot()));}catch(e){}
        localStorage.setItem('fatLossPlanner.v1',JSON.stringify(cloud.nutrition));if(cloud.workouts)localStorage.setItem('fatLossPlanner.workouts.v1',JSON.stringify(cloud.workouts));
        var keepPro=P.pro,keepH=P.health;P=normP(cloud.plus);P.health=keepH;P.pro=mergePro(P.pro,keepPro);savePlocal();location.reload();return;}
    } push();});}
function mergePro(a,b){return {owned:!!(a.owned||b.owned),trialUsed:!!(a.trialUsed||b.trialUsed),trialStart:[a.trialStart,b.trialStart].filter(Boolean).sort()[0]||null};}
function pushTrial(){if(!sb||!user||!P.pro.trialStart)return;sb.from('flp_entitlements').insert({user_id:user.id,trial_started_at:new Date(P.pro.trialStart).toISOString()}).then(function(){});}
function pullTrial(){if(!sb||!user)return;sb.rpc('flp_trial_check').then(function(r){var t=r&&r.data&&+new Date(r.data);if(t&&(!P.pro.trialStart||t<P.pro.trialStart)){P.pro.trialStart=t;P.pro.trialUsed=true;savePlocal();renderAll();}}).catch(function(){});sb.from('flp_entitlements').select('trial_started_at').eq('user_id',user.id).maybeSingle().then(function(r){
  var t=r.data&&+new Date(r.data.trial_started_at);if(t&&(!P.pro.trialStart||t<P.pro.trialStart)){P.pro.trialStart=t;P.pro.trialUsed=true;savePlocal();renderAll();}else if(!t)pushTrial();});}
function setSync(m){var e=$('acSync');if(e)e.textContent=m;}
if(sb){sb.auth.onAuthStateChange(function(ev,sess){var was=user;user=sess&&sess.user||null;renderAccount();if(!user)coachReset();if(user&&(!was||was.id!==user.id)){pullTrial();coachInit();if(isPro())pull();}});}
// mark local edits made in the original planner so sync knows which copy is newer
['fatLossPlanner.v1','fatLossPlanner.workouts.v1'].forEach(function(){});
var _set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){_set.call(this,k,v);if(this===localStorage&&(k==='fatLossPlanner.v1'||k==='fatLossPlanner.workouts.v1')){_set.call(this,'flp.localEditAt',String(Date.now()));queueSync();if(typeof coachPublish==='function')coachPublish();if(k==='fatLossPlanner.v1'||k==='fatLossPlanner.workouts.v1')setTimeout(renderHome,0);}};
function rnd(){var a=new Uint8Array(16);crypto.getRandomValues(a);return Array.prototype.map.call(a,function(x){return x.toString(16).padStart(2,'0');}).join('');}
function sha(s){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)).then(function(b){return Array.prototype.map.call(new Uint8Array(b),function(x){return x.toString(16).padStart(2,'0');}).join('');});}
function appleSignIn(){if(!sb)return toast('Sign-in unavailable offline');var SIA=PL('SignInWithApple');
  if(SIA){var raw=rnd();sha(raw).then(function(h){return SIA.authorize({clientId:'com.dhavalpatel.fatlossplanner',redirectURI:SITE,scopes:'email name',state:rnd(),nonce:h});})
    .then(function(r){return sb.auth.signInWithIdToken({provider:'apple',token:r.response.identityToken,nonce:raw});}).then(function(r){if(r.error)throw r.error;}).catch(function(e){setSync('Sign-in failed: '+(e.message||e));});return;}
  sb.auth.signInWithOAuth({provider:'apple',options:{redirectTo:SITE}}).then(function(r){if(r.error)setSync('Sign-in failed: '+r.error.message);});}
function emailSignIn(){var em=($('acEmail').value||'').trim();if(!/^\S+@\S+\.\S+$/.test(em))return setSync('Enter a valid email');
  sb.auth.signInWithOtp({email:em,options:{emailRedirectTo:SITE}}).then(function(r){setSync(r.error?'Error: '+r.error.message:'Check your email for a sign-in link'+(NATIVE?' (open it on this iPhone; the link opens the website — or enter the 6-digit code below)':''));if(!r.error&&$('acCodeRow'))$('acCodeRow').classList.remove('hide');});}
function codeSignIn(){var em=($('acEmail').value||'').trim(),c=($('acCode').value||'').trim();sb.auth.verifyOtp({email:em,token:c,type:'email'}).then(function(r){if(r.error)setSync('Code error: '+r.error.message);});}
function deleteAccount(){if(!user||!confirm('Delete your account? This removes your cloud data, coaching links and your sign-in. Data on this device stays.'))return;setSync('Deleting…');
  sb.functions.invoke('flp-delete-account',{method:'POST'}).then(function(r){if(r.error)throw r.error;sb.auth.signOut();P.role=null;savePlocal();toast('Account deleted');})
  .catch(function(e){sb.rpc('flp_delete_me').then(function(r2){if(r2.error){setSync('Delete failed: '+r2.error.message);return;}sb.auth.signOut();toast('Cloud data deleted');});});}

// ---------- Apple Health (iOS only) ----------
var HK=NATIVE&&CAP.registerPlugin?CAP.registerPlugin('FLPHealth'):null; // local Swift plugin in the iOS project (plugins/flp-health)
function healthSync(){if(!HK)return;if(!needPro('Apple Health sync'))return;
  HK.requestAuthorization().then(function(){return HK.query({days:30});}).then(function(res){var s=S(),added=0,H={steps:{},act:{},wk:{}};P.set.health=true;
    (res.weight||[]).forEach(function(x){var lb=Math.round(x.kg*LB*10)/10;if(s&&lb>50&&!s.logs.some(function(l){return l.date===x.date;})){s.logs.push({date:x.date,wLb:lb,bf:null});added++;}});
    (res.steps||[]).forEach(function(x){H.steps[x.date]=x.value;});(res.energy||[]).forEach(function(x){H.act[x.date]=x.value;});
    (res.workouts||[]).forEach(function(x){(H.wk[x.date]=H.wk[x.date]||[]).push({name:x.name,min:x.minutes,kcal:x.kcal});});
    P.health=H;P.healthAt=Date.now();if(added){var last=s.logs.slice().sort(function(a,b){return a.date<b.date?-1:1;}).pop();s.profile.weightLb=last.wLb;localStorage.setItem('fatLossPlanner.v1',JSON.stringify(s));if(window.__FLP)window.__FLP.render();}
    saveP();renderAll();toast('Apple Health synced'+(added?' · '+added+' weigh-ins added':''));
  }).catch(function(e){toast('Apple Health: '+(e&&e.message||'not allowed'));});}
if(HK&&P.set.health)setTimeout(function(){if(isPro())healthSync();},1500);
// ---------- reminders ----------
var LN=PL('LocalNotifications');
function scheduleReminders(){var r=P.set.remind;
  if(LN){LN.cancel({notifications:[{id:101},{id:102}]}).catch(function(){}).then(function(){if(!r.on)return;return LN.requestPermissions().then(function(p){if(p.display!=='granted'){toast('Notifications are off in Settings');return;}
    function at(s){var a=s.split(':');return {hour:+a[0],minute:+a[1]};}
    return LN.schedule({notifications:[{id:101,title:'Morning weigh-in ⚖️',body:'Step on the scale and keep your streak going.',schedule:{on:at(r.weigh),repeats:true,allowWhileIdle:true}},{id:102,title:'Log today\'s food 🥗',body:'Takes 30 seconds — tap to add your meals.',schedule:{on:at(r.meals),repeats:true,allowWhileIdle:true}}]});});}).then(function(){if(r.on)toast('Daily reminders set');}).catch(function(){});return;}
  if(r.on&&'Notification' in window){Notification.requestPermission().then(function(p){toast(p==='granted'?'Reminders work while this page is open. Install the iPhone app for real reminders.':'Notifications are blocked in this browser');});}}
setInterval(function(){var r=P.set.remind;if(LN||!r.on||!('Notification' in window)||Notification.permission!=='granted')return;var n=new Date(),hm=String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0'),k='flp.rem.'+today()+hm;
  if((hm===r.weigh||hm===r.meals)&&!localStorage.getItem(k)){localStorage.setItem(k,'1');new Notification(hm===r.weigh?'Morning weigh-in ⚖️':'Log today\'s food 🥗');}},30000);

// ---------- weekly check-in (Pro) ----------
function checkinData(){var m=M()||{},rate=weeklyRate(),kc=[],i;for(i=1;i<=7;i++){var t=totals(today(-i));if(t.kcal>300)kc.push(t.kcal);}
  var avg=kc.length?kc.reduce(function(a,b){return a+b;},0)/kc.length:null,target=m.kcal||null,s=S(),cur=s&&s.override||target,sug=null,msg;
  var exp=m.rate||null;// expected lb/week
  if(rate==null){msg='Log at least a week of weigh-ins to get a check-in.';}
  else if(exp&&rate<exp*0.5&&(avg==null||avg<=cur*1.08)){var cut=rate<0.1?150:100;sug=Math.max(m.floor||1200,Math.round((cur-cut)/10)*10);msg='Your trend is down '+fw(Math.max(0,rate))+'/week vs about '+fw(exp)+' expected. Progress has stalled, so a small cut of ~'+(cur-sug)+' kcal/day may help.';if(sug>=cur){sug=null;msg+=' You are already at your calorie floor — focus on steps and consistency instead.';}}
  else if(avg!=null&&avg>cur*1.08){msg='You averaged '+r0(avg)+' kcal on logged days vs a '+r0(cur)+' target. Getting closer to the target is the first step before changing it.';}
  else if(exp&&rate>exp*1.6&&rate>1.5){sug=Math.round((cur+100)/10)*10;msg='You are losing '+fw(rate)+'/week — faster than planned. Adding ~100 kcal/day can help protect muscle and energy.';}
  else msg='On track: trend '+fw(Math.max(0,rate))+'/week. Keep your current target.';
  return {rate:rate,avg:avg,cur:cur,sug:sug,msg:msg,days:kc.length};}
function checkinDue(){return !P.lastCheckin||Date.now()-P.lastCheckin>=7*DAY;}

// ---------- Coach / Doctor mode (two-sided). Wellness & coaching only — diet + workouts. Free. ----------
var CO={role:null,name:'',links:[],items:[],log:[],invite:null,patients:[],cur:null,err:''};
var COACH_NOTE='A wellness & coaching tool, not a medical record. It is not a HIPAA-covered service — please don\'t share medical information here.';
function rpc(fn,args){if(!sb||!user)return Promise.reject(new Error('Sign in first'));return sb.rpc(fn,args||{}).then(function(r){if(r.error)throw r.error;return r.data;});}
function coachReset(){CO={role:null,name:'',links:[],items:[],log:[],invite:null,patients:[],cur:null,err:''};P.role=null;savePlocal();updCoachTab();renderCoach();}
function coachInit(){rpc('flp_my_profile').then(function(pr){CO.role=pr&&pr.role||null;CO.name=pr&&pr.name||'';P.role=CO.role;savePlocal();updCoachTab();return coachRefresh();}).catch(function(e){CO.err=e.message;renderCoach();});}
function coachRefresh(){if(CO.role==='patient')return Promise.all([rpc('flp_patient_links'),rpc('flp_my_items'),rpc('flp_access_log_mine')]).then(function(r){CO.links=r[0]||[];if(CO.links.some(function(l){return l.status==='pending'||Date.now()-new Date(l.consented_at||0)<6e5;}))CO.invite=null;CO.items=r[1]||[];CO.log=r[2]||[];CO.err='';renderAll();if(CO.links.some(function(l){return l.status==='active';}))coachPublish();}).catch(function(e){CO.err=e.message;renderCoach();});
  if(CO.role==='coach')return rpc('flp_coach_patients').then(function(r){CO.patients=r||[];CO.err='';renderCoach();renderClients();}).catch(function(e){CO.err=e.message;renderClients();});
  renderCoach();return Promise.resolve();}
function shareData(){var w=window.__FLW?window.__FLW.get():{},food={},i;for(i=0;i<60;i++){var d=today(-i);if(P.food[d]&&P.food[d].length)food[d]=P.food[d].map(function(x){return {name:x.name,kcal:x.kcal,p:x.p,c:x.c,f:x.f,fib:x.fib,qty:x.qty,meal:x.meal};});}
  var T=targets();return {at:Date.now(),targets:{kcal:r0(T.kcal),p:r0(T.p),c:r0(T.c),f:r0(T.f),fib:r0(T.fib)},food:food,meals:P.meals,workouts:{sel:w.sel,custom:w.custom,tpl:w.tpl,extra:w.extra,log:w.log}};} // no weight, measurements, Health or medical modes
function wkDone(d){var w=W();if(!w||!w.log||!w.log[d])return 0;var n=0,L=w.log[d];for(var k in L){var ex=(L[k]&&L[k].ex)||[];if(ex.some(function(e){return (e.sets||[]).some(function(x){return x.d;});}))n++;}return n;}
function shareSummary(){var T=targets(),fd=0,sum=0,ph=0,wk=0,last=null,i;for(i=0;i<7;i++){var d=today(-i),t=totals(d);if(t.kcal>0){fd++;sum+=t.kcal;if(t.p>=T.p*0.9)ph++;}wk+=wkDone(d);}
  for(i=0;i<120;i++){var dd=today(-i);if(dayFood(dd).length||wkDone(dd)){last=dd;break;}}
  return {last_log:last,streak:streak(),food_days_7:fd,avg_kcal_7:fd?r0(sum/fd):null,kcal_target:r0(T.kcal),workouts_7:wk,protein_hit_7:ph};}
var pubT;function coachPublish(){if(CO.role!=='patient'||!CO.links.some(function(l){return l.status==='active';}))return;clearTimeout(pubT);pubT=setTimeout(function(){rpc('flp_publish',{p_data:shareData(),p_summary:shareSummary()}).catch(function(){});},1200);}
function fmtAgo(ds){if(!ds)return 'never';var n=Math.round((tOf(today())-tOf(ds))/DAY);return n<=0?'today':n===1?'yesterday':n+' days ago';}
function flags(s){var f=[];if(!s)return f;if((s.food_days_7||0)<4)f.push('Logging gaps');if(s.avg_kcal_7&&s.kcal_target&&s.avg_kcal_7>s.kcal_target*1.1)f.push('Over calories');if(s.avg_kcal_7&&s.kcal_target&&s.avg_kcal_7<s.kcal_target*0.75)f.push('Eating very low');if(!s.workouts_7)f.push('No workouts this week');if(s.food_days_7&&(s.protein_hit_7||0)<Math.ceil(s.food_days_7/2))f.push('Low protein');return f;}
function itemText(it){var b=it.body||{};if(it.kind==='targets')return b.kcal+' kcal · P '+b.p+' g · C '+b.c+' g · F '+b.f+' g'+(b.fib?' · fiber '+b.fib+' g':'')+(b.note?' — “'+esc(b.note)+'”':'');
  if(it.kind==='workout')return (b.per_week||'?')+' workouts/week'+(b.minutes?' · '+b.minutes+' min each':'')+(b.note?' — “'+esc(b.note)+'”':'');return '“'+esc(b.text)+'”';}
function acceptItem(it){if(it.kind==='targets'){var b=it.body,s=S();if(b.kcal){s.override=b.kcal;localStorage.setItem('fatLossPlanner.v1',JSON.stringify(s));if(window.__FLP)window.__FLP.render();}P.coachTargets=b;P.coachAccepted=true;}
  if(it.kind==='workout')P.coachWorkout=it.body;saveP();}
function renderCoach(){var el=$('coachBox');if(!el)return;var h='<div class="hint">Link with your coach or doctor to share <b>only your diet and workouts</b> — never weight, body measurements, Apple Health data or EDS / blood-sugar settings. Coach mode is free.</div>';
  if(!sb){el.innerHTML=h+'<div class="hint">Unavailable offline.</div>';return;}
  if(!user){el.innerHTML=h+'<div class="hint">Sign in above (Apple or email) to use coaching.</div><p class="disc0">'+COACH_NOTE+'</p>';return;}
  if(CO.err)h+='<div class="warn">'+esc(CO.err)+'</div>';
  if(!CO.role){el.innerHTML=h+'<h3>How will you use coaching?</h3><div class="row"><button class="pri" data-act="coRoleP">I\'m a client / patient</button><button data-act="coRoleC">I\'m a coach / doctor</button></div><p class="disc0">'+COACH_NOTE+'</p>';return;}
  if(CO.role==='coach'){el.innerHTML=h+'<div class="hint">You are set up as <b>Coach / Doctor</b> ('+esc(CO.name)+'). Your clients are in the <b>🩺 Clients</b> tab.</div><div class="row"><button class="pri" data-go="coach">Open Clients</button><button class="sm" data-act="coSwitch">Switch role</button></div><p class="disc0">'+COACH_NOTE+'</p>';return;}
  var act=CO.links.filter(function(l){return l.status==='active';}),pend=CO.links.filter(function(l){return l.status==='pending';});
  h+='<h3>Invite your coach</h3>'+(CO.invite?'<div class="code">'+esc(CO.invite)+'</div><div class="hint">Give this code to your coach. They enter it in their app (Clients tab). It works once and expires in 48 hours. Nothing is shared until you approve.</div><button class="sm" data-act="coShareCode">Share code</button>':'<button class="pri" data-act="coInvite">Create invite code</button>');
  if(pend.length)h+='<h3>Waiting for your OK</h3>'+pend.map(function(l){return '<div class="lnk"><div><b>'+esc(l.coach_name)+'</b> wants to see your diet &amp; workouts.</div><div class="row"><button class="pri sm" data-act="coApprove" data-id="'+l.id+'">Allow</button><button class="sm" data-act="coDecline" data-id="'+l.id+'">Decline</button></div></div>';}).join('');
  h+='<h3>Who has access</h3>'+(act.length?act.map(function(l){return '<div class="lnk"><div><b>'+esc(l.coach_name)+'</b><div class="hint">Since '+new Date(l.consented_at).toLocaleDateString()+' · sees diet &amp; workouts only</div></div><button class="sm danger" data-act="coRevoke" data-id="'+l.id+'">Revoke</button></div>';}).join(''):'<div class="hint">Nobody. Your data is private.</div>');
  var pi=CO.items.filter(function(i){return i.status==='pending';}),oi=CO.items.filter(function(i){return i.status!=='pending';}).slice(0,8);
  if(pi.length)h+='<h3>From your coach</h3>'+pi.map(function(it){return '<div class="lnk"><div><b>'+esc(it.coach_name)+'</b> suggests '+(it.kind==='targets'?'daily targets':'a workout goal')+':<div>'+itemText(it)+'</div></div><div class="row"><button class="pri sm" data-act="coAccept" data-id="'+it.id+'">Accept</button><button class="sm" data-act="coRefuse" data-id="'+it.id+'">Decline</button></div></div>';}).join('');
  if(oi.length)h+='<details><summary>Coach notes &amp; history</summary>'+oi.map(function(it){return '<div class="hint">'+new Date(it.created_at).toLocaleDateString()+' · '+esc(it.coach_name)+' · '+(it.kind==='note'?'Note: ':it.kind+' ('+it.status+'): ')+itemText(it)+'</div>';}).join('')+'</details>';
  h+='<details><summary>Access log</summary>'+(CO.log.length?CO.log.map(function(x){return '<div class="hint">'+new Date(x.at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' · '+esc(x.who)+' · '+esc(x.action)+'</div>';}).join(''):'<div class="hint">No activity yet.</div>')+'</details>';
  el.innerHTML=h+'<div class="row" style="margin-top:8px"><button class="sm" data-act="coRefresh">Refresh</button><button class="sm" data-act="coSwitch">Switch role</button></div><p class="disc0">'+COACH_NOTE+'</p>';}
// ---- coach side ----
function updCoachTab(){var tabs=$('tabs');if(!tabs)return;var b=tabs.querySelector('[data-tab="coach"]');if(CO.role==='coach'&&!b)tabs.insertAdjacentHTML('beforeend','<button data-tab="coach">🩺<span>Clients</span></button>');if(CO.role!=='coach'&&b){b.remove();if(!$('tab-coach').classList.contains('hide'))window.__FLPshow('home');}}
function renderClients(){var el=$('tab-coach');if(!el||el.classList.contains('hide'))return;if(CO.cur){renderPatient();return;}
  var h='<section class="card wide"><h2>🩺 My clients</h2><div class="row"><input id="coCode" placeholder="Enter invite code" autocapitalize="characters" maxlength="8"><button class="pri" data-act="coRedeem" style="flex:0 0 auto">Link</button></div><div class="hint">Your client creates the code in their app (Me → Coach / Doctor) and must approve the link.</div>'+(CO.err?'<div class="warn">'+esc(CO.err)+'</div>':'')+'</section>';
  h+=CO.patients.length?CO.patients.map(function(p){var s=p.summary||{},f=flags(s);return '<section class="card pcard" '+(p.status==='active'?'data-act="coOpen" data-id="'+p.patient_id+'"':'')+'><div class="hrow"><div><b class="pn">'+esc(p.name)+'</b><div class="hint">'+(p.status==='pending'?'⏳ Waiting for client approval':'Last log: '+fmtAgo(s.last_log)+' · 🔥 '+(s.streak||0)+'-day streak')+'</div></div>'+(p.status==='active'?'<span class="chev">›</span>':'')+'</div>'+
    (p.status==='active'?'<div class="stats"><div class="stat"><div class="v">'+(s.food_days_7||0)+'/7</div><div class="l">Days food logged</div></div><div class="stat"><div class="v">'+(s.avg_kcal_7||'—')+'</div><div class="l">Avg kcal (target '+(s.kcal_target||'—')+')</div></div><div class="stat"><div class="v">'+(s.workouts_7||0)+'</div><div class="l">Workouts (7 days)</div></div><div class="stat"><div class="v">'+(s.protein_hit_7||0)+'/'+(s.food_days_7||0)+'</div><div class="l">Protein goal hit</div></div></div>'+(f.length?'<div class="flags">'+f.map(function(x){return '<span class="flag">⚠️ '+x+'</span>';}).join('')+'</div>':'<div class="ok">✓ On track</div>'):'')+'</section>';}).join(''):'<section class="card wide"><p class="hint">No clients yet. Ask a client for their invite code.</p></section>';
  el.innerHTML=h+'<p class="disc">'+COACH_NOTE+' You see only diet and workouts your client chooses to share; every view is recorded in their access log.</p>';}
function openPatient(id){rpc('flp_coach_patient',{p_patient:id}).then(function(d){CO.cur={id:id,d:d};renderClients();window.scrollTo(0,0);}).catch(function(e){toast(e.message);});}
function barChart(cv,vals,labels,target,color){if(!cv)return;var dpr=window.devicePixelRatio||1,w=cv.clientWidth||320,h=150;cv.width=w*dpr;cv.height=h*dpr;var x=cv.getContext('2d');x.scale(dpr,dpr);var cs=getComputedStyle(document.documentElement);
  var mx=Math.max.apply(0,vals.concat([target||0,1]))*1.12,n=vals.length,bw=(w-10)/n;
  vals.forEach(function(v,i){var bh=v/mx*(h-24);x.fillStyle=v&&target&&v>target*1.1?cs.getPropertyValue('--bad'):color;x.fillRect(6+i*bw+bw*0.15,h-16-bh,bw*0.7,bh);});
  x.fillStyle=cs.getPropertyValue('--muted');x.font='10px -apple-system,sans-serif';labels.forEach(function(l,i){if(n<=8||i%2===0)x.fillText(l,6+i*bw+bw*0.1,h-3);});
  if(target){var y=h-16-target/mx*(h-24);x.strokeStyle=cs.getPropertyValue('--fg');x.setLineDash([4,4]);x.beginPath();x.moveTo(4,y);x.lineTo(w-4,y);x.stroke();x.setLineDash([]);x.fillText('target '+target,w-70,y-3);}}
function renderPatient(){var el=$('tab-coach'),c=CO.cur,d=(c.d&&c.d.data)||{},T=d.targets||{},food=d.food||{},wl=(d.workouts&&d.workouts.log)||{},i;
  var days=[],kc=[],pr=[],lab=[];for(i=13;i>=0;i--){var dd=today(-i),t={k:0,p:0};(food[dd]||[]).forEach(function(x){var q=x.qty||1;t.k+=x.kcal*q;t.p+=(x.p||0)*q;});days.push(dd);kc.push(r0(t.k));pr.push(r0(t.p));lab.push(dd.slice(8));}
  var wk=[],wl2=[];for(i=5;i>=0;i--){var n=0;for(var j=0;j<7;j++){var dd2=today(-(i*7+j)),L=wl[dd2]||{};for(var k in L){if(((L[k]&&L[k].ex)||[]).some(function(e){return (e.sets||[]).some(function(z){return z.d;});}))n++;}}wk.push(n);wl2.push(i?'-'+i+'w':'now');}
  var sess=[],prs={};Object.keys(wl).sort().reverse().forEach(function(dd){Object.keys(wl[dd]).forEach(function(k){var ex=((wl[dd][k]||{}).ex||[]).filter(function(e){return (e.sets||[]).some(function(z){return z.d;});});if(ex.length)sess.push({d:dd,t:ex.map(function(e){var st=e.sets.filter(function(z){return z.d;});return e.n+' '+st.length+'×'+(st[0].r||'')+(st[0].w?' @'+st[0].w:'');}).join(' · ')});
    ex.forEach(function(e){e.sets.forEach(function(z){if(z.d&&+z.w>0){var r=parseFloat(z.r)||1,v=r>1?z.w*(1+r/30):+z.w;if(!prs[e.n]||v>prs[e.n].v)prs[e.n]={v:v,w:z.w,r:z.r};}});});});});
  var fd=Object.keys(food).sort().reverse().slice(0,5),items=(c.d&&c.d.items)||[];
  var h='<section class="card wide"><div class="hrow"><button class="sm" data-act="coBack">‹ Clients</button><div style="text-align:right"><b class="pn">'+esc(c.d.name)+'</b><div class="hint">Updated '+(c.d.updated_at?new Date(c.d.updated_at).toLocaleString():'— (client hasn\'t synced yet)')+'</div></div></div><div class="hint" style="margin-top:6px">Current targets: '+(T.kcal||'—')+' kcal · P '+(T.p||'—')+' · C '+(T.c||'—')+' · F '+(T.f||'—')+' g</div></section>'+
   '<section class="card"><h2>Calories · 14 days</h2><canvas id="cvK" style="width:100%;height:150px"></canvas></section><section class="card"><h2>Protein g · 14 days</h2><canvas id="cvP" style="width:100%;height:150px"></canvas></section><section class="card"><h2>Workouts per week</h2><canvas id="cvW" style="width:100%;height:150px"></canvas></section>'+
   '<section class="card"><h2>Recent food</h2>'+(fd.length?fd.map(function(dd){var tk=food[dd].reduce(function(a,x){return a+x.kcal*(x.qty||1);},0);return '<div class="fitem"><div class="fn"><b>'+dd+' · '+r0(tk)+' kcal</b><div class="hint">'+esc(food[dd].map(function(x){return x.name;}).join(', '))+'</div></div></div>';}).join(''):'<div class="hint">No food logged.</div>')+'</section>'+
   '<section class="card"><h2>Recent workouts</h2>'+(sess.length?sess.slice(0,6).map(function(x){return '<div class="hint"><b>'+x.d+'</b> · '+esc(x.t)+'</div>';}).join(''):'<div class="hint">No completed workouts.</div>')+(Object.keys(prs).length?'<h3>PRs (est. 1RM)</h3>'+Object.keys(prs).slice(0,8).map(function(n){return '<div class="hint">'+esc(n)+': '+prs[n].w+' × '+esc(prs[n].r)+' ≈ '+r0(prs[n].v)+'</div>';}).join(''):'')+'</section>'+
   '<section class="card"><h2>Set daily targets</h2><div class="row f"><div><label>kcal</label><input id="ctK" type="number" value="'+(T.kcal||'')+'"></div><div><label>Protein g</label><input id="ctP" type="number" value="'+(T.p||'')+'"></div></div><div class="row f"><div><label>Carbs g</label><input id="ctC" type="number" value="'+(T.c||'')+'"></div><div><label>Fat g</label><input id="ctF" type="number" value="'+(T.f||'')+'"></div><div><label>Fiber g</label><input id="ctFi" type="number" value="'+(T.fib||'')+'"></div></div><input id="ctN" placeholder="Why (optional)"><button class="pri wide" data-act="coSendT">Send targets</button><div class="hint">Your client sees this and can accept or decline.</div></section>'+
   '<section class="card"><h2>Set workout goal</h2><div class="row f"><div><label>Workouts / week</label><input id="cwN" type="number" value="3"></div><div><label>Minutes each</label><input id="cwM" type="number" value="45"></div></div><input id="cwT" placeholder="e.g. 2 strength + 1 walk"><button class="pri wide" data-act="coSendW">Send workout goal</button></section>'+
   '<section class="card"><h2>Leave a note</h2><textarea id="cnT" rows="3" placeholder="Encouragement or tips"></textarea><button class="wide" data-act="coSendN">Send note</button></section>'+
   '<section class="card wide"><h2>Sent</h2>'+(items.length?items.map(function(it){return '<div class="hint">'+new Date(it.created_at).toLocaleDateString()+' · '+it.kind+' · <b>'+(it.status==='info'?'note':it.status)+'</b> · '+itemText(it)+'</div>';}).join(''):'<div class="hint">Nothing sent yet.</div>')+'<button class="sm danger" data-act="coLeave" data-id="'+c.id+'" style="margin-top:8px">Stop coaching this client</button></section>';
  el.innerHTML=h+'<p class="disc">'+COACH_NOTE+'</p>';
  var cs=getComputedStyle(document.documentElement);barChart($('cvK'),kc,lab,T.kcal,cs.getPropertyValue('--acc'));barChart($('cvP'),pr,lab,T.p,cs.getPropertyValue('--p'));barChart($('cvW'),wk,wl2,null,cs.getPropertyValue('--f'));}
function coachAct(a,t){var id=t.getAttribute('data-id');function done(m){return function(){if(m)toast(m);coachRefresh();};}function fail(e){toast(e.message||String(e));}
  if(a==='coRoleP'||a==='coRoleC'){var nm=prompt(a==='coRoleC'?'Your name as clients will see it (e.g. Coach Sam, Dr. Lee)':'Your first name (your coach sees this)','');if(nm===null)return true;
    rpc('flp_set_role',{p_role:a==='coRoleC'?'coach':'patient',p_name:nm}).then(function(r){CO.role=r.role;CO.name=r.name;P.role=r.role;savePlocal();updCoachTab();coachRefresh();toast('Saved');}).catch(fail);return true;}
  if(a==='coSwitch'){CO.role=null;renderCoach();return true;}
  if(a==='coRefresh'){coachRefresh();return true;}
  if(a==='coInvite'){rpc('flp_create_invite').then(function(c){CO.invite=c;renderCoach();}).catch(fail);return true;}
  if(a==='coShareCode'){var txt='My Fat-Loss Planner coaching code: '+CO.invite+' (open the app → 🩺 Clients → enter code)';var SH=PL('Share');if(SH)SH.share({text:txt}).catch(function(){});else if(navigator.share)navigator.share({text:txt}).catch(function(){});else{try{navigator.clipboard.writeText(CO.invite);toast('Code copied');}catch(e){}}return true;}
  if(a==='coApprove'){if(!confirm('Allow this coach to see your food log, targets, saved meals and workouts? You can revoke at any time.'))return true;rpc('flp_set_link',{p_link:id,p_action:'approve'}).then(done('Access allowed')).catch(fail);return true;}
  if(a==='coDecline'){rpc('flp_set_link',{p_link:id,p_action:'decline'}).then(done('Declined')).catch(fail);return true;}
  if(a==='coRevoke'){if(!confirm('Revoke access? Your coach will no longer see your data.'))return true;rpc('flp_set_link',{p_link:id,p_action:'revoke'}).then(done('Access revoked')).catch(fail);return true;}
  if(a==='coAccept'||a==='coRefuse'){var it=CO.items.filter(function(x){return x.id===id;})[0];rpc('flp_respond',{p_item:id,p_status:a==='coAccept'?'accepted':'declined'}).then(function(){if(a==='coAccept'&&it)acceptItem(it);done(a==='coAccept'?'New goal applied':'Declined')();}).catch(fail);return true;}
  if(a==='coRedeem'){var code=($('coCode').value||'').trim();if(!code)return true;rpc('flp_redeem_invite',{p_code:code}).then(function(r){toast('Request sent to '+r.patient_name+' — waiting for their approval');coachRefresh();}).catch(function(e){CO.err=e.message;renderClients();});return true;}
  if(a==='coOpen'){openPatient(id);return true;}
  if(a==='coBack'){CO.cur=null;coachRefresh();return true;}
  if(a==='coLeave'){var lk=CO.patients.filter(function(p){return p.patient_id===id;})[0];if(!lk||!confirm('Stop coaching this client?'))return true;rpc('flp_set_link',{p_link:lk.link_id,p_action:'leave'}).then(function(){CO.cur=null;coachRefresh();}).catch(fail);return true;}
  if(a==='coSendT'||a==='coSendW'||a==='coSendN'){var pid=CO.cur.id,body,kind;function v(i){return +$(i).value||null;}
    if(a==='coSendT'){kind='targets';body={kcal:v('ctK'),p:v('ctP'),c:v('ctC'),f:v('ctF'),fib:v('ctFi'),note:$('ctN').value};if(!body.kcal){toast('Enter calories');return true;}}
    else if(a==='coSendW'){kind='workout';body={per_week:v('cwN'),minutes:v('cwM'),note:$('cwT').value};}
    else{kind='note';body={text:$('cnT').value};if(!body.text.trim())return true;}
    rpc('flp_coach_send',{p_patient:pid,p_kind:kind,p_body:body}).then(function(){toast('Sent');openPatient(pid);}).catch(fail);return true;}
  return false;}
setInterval(function(){if(user&&CO.role)coachRefresh();},120000);
// ---------- rendering ----------
function ring(val,tgt,label,cls){var pct=tgt?Math.min(1,val/tgt):0,C=2*Math.PI*30;return '<div class="ring '+(cls||'')+'"><svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="30" class="rb"/><circle cx="36" cy="36" r="30" class="rf" stroke-dasharray="'+(pct*C)+' '+C+'" transform="rotate(-90 36 36)"/></svg><div class="rv"><b>'+r0(val)+'</b><span>/'+r0(tgt)+'</span></div><div class="rl">'+label+'</div></div>';}
function bar(lbl,v,t,cls,u){var pct=t?Math.min(100,v/t*100):0;return '<div class="mb"><div class="mbl"><span>'+lbl+'</span><span>'+r0(v)+' / '+r0(t)+(u||'g')+'</span></div><div class="mbt"><div class="mbf '+cls+(v>t*1.05?' over':'')+'" style="width:'+pct+'%"></div></div></div>';}
function renderHome(){var el=$('tab-home');if(!el||el.classList.contains('hide'))return;var m=M()||{},t=totals(today()),T=targets(),s=S(),L=logs(),tr=trend(),last=tr[tr.length-1],st=streak();
  var start=L.length?L[0].wLb:(s&&s.profile.weightLb),cur=last?last.t:(s&&s.profile.weightLb),goal=m.target||(s&&s.profile.goalWeightLb),prog=start&&goal&&start>goal?Math.max(0,Math.min(1,(start-cur)/(start-goal))):0;
  var exNames=todaysExercises(),h=P.health||{},td=today();
  var html='<section class="card wide hero"><div class="hrow"><div><div class="hint">'+new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})+'</div><h2 class="ht">'+(r0(T.kcal-t.kcal)>=0?r0(T.kcal-t.kcal)+' kcal left today':r0(t.kcal-T.kcal)+' kcal over today')+'</h2></div><div class="streak" title="Days in a row with a log">🔥<b>'+st+'</b><span>day streak</span></div></div>'+
   '<div class="rings">'+ring(t.kcal,T.kcal,'Calories','rg-k')+ring(t.p,T.p,'Protein g','rg-p')+ring(t.c,T.c,'Carbs g','rg-c')+ring(t.f,T.f,'Fat g','rg-f')+'</div>'+
   '<div class="row qa"><button class="pri" data-go="food">＋ Log food</button><button data-act="weigh">⚖️ Weigh in</button><button data-go="workouts">🏋️ Workout</button></div></section>';
  html+='<section class="card"><h2>Goal</h2><div class="goalbar"><div style="width:'+(prog*100).toFixed(0)+'%"></div></div><div class="stats"><div class="stat"><div class="v">'+fw(cur)+'</div><div class="l">Trend weight</div></div><div class="stat"><div class="v">'+fw(goal)+'</div><div class="l">Goal</div></div><div class="stat"><div class="v">'+(start&&cur?fw(Math.max(0,start-cur)):'—')+'</div><div class="l">Lost so far</div></div><div class="stat"><div class="v">'+(prog*100).toFixed(0)+'%</div><div class="l">of the way there</div></div></div>'+(m.path&&m.weeks?'<div class="hint">Projected goal date: <b>'+new Date(Date.now()+m.weeks*7*DAY).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})+'</b></div>':'')+'</section>';
  html+='<section class="card"><h2>Weight trend</h2><canvas id="trendCv" style="width:100%;height:160px"></canvas><div class="hint">Dots = daily weigh-ins · line = smoothed trend (ignores water swings). '+(weeklyRate()!=null?'Trend: <b>'+(weeklyRate()>=0?'−':'+')+fw(Math.abs(weeklyRate()))+'/week</b>':'')+'</div></section>';
  // weekly check-in
  var ci=checkinData();html+='<section class="card"><h2>Weekly check-in '+(isPro()?'':'<span class="pill pro">PRO</span>')+'</h2>'+(isPro()?'<p>'+esc(ci.msg)+'</p>'+(ci.sug?'<div class="row"><button class="pri" data-act="ciApply">Use '+ci.sug+' kcal/day</button><button data-act="ciKeep">Keep '+r0(ci.cur)+'</button></div>':(checkinDue()?'<button data-act="ciKeep">Mark check-in done</button>':''))+'<div class="hint">'+(P.lastCheckin?'Last check-in '+new Date(P.lastCheckin).toLocaleDateString():'Do this once a week, after a morning weigh-in.')+'</div>':'<p class="hint">Every week, the app looks at your trend and food log and suggests a small calorie change if you\'ve stalled.</p><button data-pro="Weekly smart check-in">Unlock</button>')+'</section>';
  // health
  if(NATIVE)html+='<section class="card"><h2>Apple Health '+(isPro()?'':'<span class="pill pro">PRO</span>')+'</h2>'+(P.set.health&&isPro()?'<div class="stats"><div class="stat"><div class="v">'+(h.steps&&h.steps[td]?r0(h.steps[td]).toLocaleString():'—')+'</div><div class="l">Steps today</div></div><div class="stat"><div class="v">'+(h.act&&h.act[td]?r0(h.act[td]):'—')+'</div><div class="l">Active kcal</div></div></div>'+((h.wk&&h.wk[td])||[]).map(function(w){return '<div class="hint">🏃 '+esc(w.name)+' · '+w.min+' min · '+w.kcal+' kcal</div>';}).join('')+'<button class="sm" data-act="health">Sync now</button>':'<p class="hint">Bring in weight, steps, workouts and active energy automatically.</p><button data-act="health">Connect Apple Health</button>')+'</section>';
  var pend=(CO.items||[]).filter(function(i){return i.status==='pending';}).length,cw=P.coachWorkout,wk7=0;for(var q=0;q<7;q++)wk7+=wkDone(today(-q));
  if(pend||cw)html+='<section class="card"><h2>🩺 Coach</h2>'+(pend?'<p><b>'+pend+' new suggestion'+(pend>1?'s':'')+'</b> from your coach.</p><button class="pri" data-go="me">Review</button>':'')+(cw?'<div class="hint">Workout goal: <b>'+wk7+' / '+cw.per_week+'</b> this week'+(cw.minutes?' · '+cw.minutes+' min each':'')+(cw.note?' — '+esc(cw.note):'')+'</div>':'')+'</section>';
  // personalization
  if(P.set.eds&&isPro()&&exNames.length){var sw=exNames.filter(function(n){return SWAPS[n];});html+='<section class="card"><h2>🦴 Joint-friendly swaps for today</h2>'+(sw.length?'<ul class="swaps">'+sw.map(function(n){return '<li><s>'+esc(n)+'</s> → <b>'+esc(SWAPS[n])+'</b></li>';}).join('')+'</ul>':'<p class="hint">Today\'s exercises are already joint-friendly.</p>')+'<div class="hint">Move slowly, stop well short of end range, and skip anything that causes pain or instability.</div></section>';}
  if(P.set.bsf&&isPro())html+='<section class="card"><h2>🩸 Blood-sugar-friendly</h2>'+bar('Carbs',t.c,T.c,'c')+bar('Fiber',t.fib,T.fib,'fib')+'<div class="hint">Carbs are kept to about 35% of calories and fiber to 35 g+. Tips: pair carbs with protein, eat veggies first, walk 10 minutes after meals. An A1c of 5.7% is the bottom of the range the ADA calls prediabetes — talk to your doctor about your own targets.</div></section>';
  el.innerHTML=html+'<p class="disc">Not medical advice. This app gives general fitness and nutrition estimates. Check with your doctor before changing your diet or exercise, especially with a health condition.</p>';
  drawTrend($('trendCv'),tr);}
function renderFood(){var el=$('foodDay');if(!el)return;var t=totals(curDay),T=targets(),list=dayFood(curDay);
  $('fDate').value=curDay;
  $('fTotals').innerHTML=bar('Calories',t.kcal,T.kcal,'k',' kcal')+bar('Protein',t.p,T.p,'p')+bar('Carbs',t.c,T.c,'c')+bar('Fat',t.f,T.f,'f')+bar('Fiber',t.fib,T.fib,'fib');
  var groups={};list.forEach(function(x){(groups[x.meal||'Snack']=groups[x.meal||'Snack']||[]).push(x);});
  el.innerHTML=list.length?['Breakfast','Lunch','Dinner','Snack'].filter(function(g){return groups[g];}).map(function(g){var gt=groups[g].reduce(function(a,x){return a+x.kcal*(x.qty||1);},0);
    return '<div class="mealh"><b>'+g+'</b><span>'+r0(gt)+' kcal</span></div>'+groups[g].map(function(x){return '<div class="fitem"><div class="fn"><b>'+esc(x.name)+'</b><div class="hint">'+(x.qty!==1?x.qty+' × ':'')+r0(x.kcal*(x.qty||1))+' kcal · P '+r0(x.p*(x.qty||1))+' · C '+r0(x.c*(x.qty||1))+' · F '+r0(x.f*(x.qty||1))+'</div></div><button class="sm" data-qty="'+x.id+'" aria-label="Change servings">×'+(x.qty||1)+'</button><button class="sm" data-del="'+x.id+'" aria-label="Remove">✕</button></div>';}).join('');}).join('')+'<button class="sm" data-act="saveMeal">💾 Save today as a meal</button>':'<div class="hint">Nothing logged for this day yet.</div>';
  $('fFavs').innerHTML=(P.favs.length?P.favs.map(function(x,i){return '<button class="chip" data-fav="'+i+'">⭐ '+esc(x.name)+' <small>'+r0(x.kcal)+'</small></button>';}).join(''):'<span class="hint">Tap ☆ on any food to save it here.</span>')+
    P.meals.map(function(m,i){return '<button class="chip meal" data-meal="'+i+'">🍱 '+esc(m.name)+' <small>'+r0(m.items.reduce(function(a,x){return a+x.kcal*(x.qty||1);},0))+'</small></button>';}).join('');
  if(!$('fSearch').value)showResults(P.recent.slice(0,8));
  // advanced stats (Pro)
  var a=$('fStats');if(isPro()){var d7=[],i;for(i=0;i<7;i++){var tt=totals(today(-i));if(tt.kcal>0)d7.push(tt);}var av=function(k){return d7.length?d7.reduce(function(s,x){return s+x[k];},0)/d7.length:0;};
    a.innerHTML=d7.length?'<div class="stats"><div class="stat"><div class="v">'+r0(av('kcal'))+'</div><div class="l">Avg kcal (7 days logged: '+d7.length+')</div></div><div class="stat"><div class="v">'+r0(av('p'))+' g</div><div class="l">Avg protein</div></div><div class="stat"><div class="v">'+d7.filter(function(x){return Math.abs(x.kcal-T.kcal)<=T.kcal*0.1;}).length+'/'+d7.length+'</div><div class="l">Days on target (±10%)</div></div><div class="stat"><div class="v">'+d7.filter(function(x){return x.p>=T.p*0.9;}).length+'/'+d7.length+'</div><div class="l">Protein goal hit</div></div></div>':'<div class="hint">Log food for a few days to see your averages.</div>';}
  else a.innerHTML='<p class="hint">7-day averages, days on target and protein consistency.</p><button data-pro="Advanced stats">Unlock</button>';}
function renderAccount(){var el=$('acBox');if(!el)return;var h='<div class="hint">Plan: <b>'+proLabel()+'</b></div>';
  if(P.pro.trialStart&&!P.pro.owned)h+='<div class="hint">'+(trialLeft()>0?'Trial ends '+new Date(P.pro.trialStart+TRIAL_DAYS*DAY).toLocaleDateString()+'. After that Pro features lock — you are never charged automatically and your data is kept.':'Trial ended. Your data is kept.')+'</div>';
  if(!P.pro.owned)h+='<button class="pri" data-pro="">'+(NATIVE?'See Pro options':'About Pro (iPhone app)')+'</button> ';
  if(NATIVE)h+='<button data-act="restore">Restore Purchases</button>';
  h+='<h3>Cloud sync '+(isPro()?'':'<span class="pill pro">PRO</span>')+'</h3>';
  if(!sb)h+='<div class="hint">Cloud sign-in is unavailable right now.</div>';
  else if(user)h+='<div class="hint">Signed in as <b>'+esc(user.email||'Apple ID')+'</b></div><div class="row"><button data-act="syncNow">Sync now</button><button data-act="signOut">Sign out</button></div><button class="sm danger" data-act="delAcct">Delete account</button>';
  else h+='<div class="hint">Sign in to back up your data and use it on your iPhone and Mac.</div><button class="apple wide" data-act="apple"> Sign in with Apple</button><div class="row"><input id="acEmail" type="email" placeholder="you@email.com" autocomplete="email"><button data-act="email">Email link</button></div><div class="row hide" id="acCodeRow"><input id="acCode" inputmode="numeric" placeholder="6-digit code"><button data-act="code">Verify</button></div>';
  h+='<div class="hint" id="acSync">'+(user&&!isPro()?'Cloud sync is part of Pro.':'')+'</div>';el.innerHTML=h;}
function renderSettings(){var r=P.set;$('stEds').checked=r.eds;$('stBsf').checked=r.bsf;$('stProt').checked=r.strengthProt;$('stRem').checked=r.remind.on;$('stWeigh').value=r.remind.weigh;$('stMeals').value=r.remind.meals;
  document.querySelectorAll('.needpro').forEach(function(e){e.classList.toggle('locked',!isPro());});}
function renderAll(){renderHome();renderFood();renderAccount();renderSettings();renderCoach();renderClients();var b=$('proBadge');if(b){b.textContent=P.pro.owned?'PRO':trialLeft()>0?'TRIAL '+trialLeft()+'d':'';b.classList.toggle('hide',!b.textContent);}}

// ---------- UI shell ----------
function build(){
  var tabs=$('tabs');tabs.insertAdjacentHTML('afterbegin','<button data-tab="home">🏠<span>Today</span></button><button data-tab="food">🥗<span>Food</span></button>');
  tabs.insertAdjacentHTML('beforeend','<button data-tab="me">👤<span>Me</span></button>');
  tabs.querySelectorAll('button').forEach(function(b){if(!b.querySelector('span')){var t=b.textContent.trim(),i=t.indexOf(' ');b.innerHTML=t.slice(0,i)+'<span>'+(t.slice(i+1)==='Nutrition'?'Plan':t.slice(i+1))+'</span>';}});
  var hdr=document.querySelector('header h1');hdr.insertAdjacentHTML('beforeend',' <span id="proBadge" class="pill pro hide"></span>');
  var ref=$('tab-nutrition');
  ref.insertAdjacentHTML('beforebegin','<main id="tab-home" class="hide"></main><main id="tab-coach" class="hide"></main>'+
  '<main id="tab-food" class="hide"><section class="card wide"><div class="row"><button class="sm" id="fPrev" aria-label="Previous day">‹</button><input type="date" id="fDate"><button class="sm" id="fNext" aria-label="Next day">›</button></div><div id="fTotals" style="margin-top:10px"></div></section>'+
   '<section class="card wide"><h2>Add food</h2><div class="row"><input id="fSearch" type="search" placeholder="Search foods or type a barcode" autocomplete="off"><button id="fScan" class="pri" style="flex:0 0 auto" aria-label="Scan barcode">📷 Scan</button></div><div id="fResults"></div>'+
   '<details id="qaBox"><summary>⚡ Quick add (calories / macros)</summary><div class="row f"><div><label>Name</label><input id="qName" placeholder="e.g. Lunch out"></div></div><div class="row f"><div><label>kcal</label><input id="qK" type="number" inputmode="numeric"></div><div><label>Protein g</label><input id="qP" type="number" inputmode="decimal"></div></div><div class="row f"><div><label>Carbs g</label><input id="qC" type="number" inputmode="decimal"></div><div><label>Fat g</label><input id="qF" type="number" inputmode="decimal"></div><div><label>Fiber g</label><input id="qFib" type="number" inputmode="decimal"></div></div><div class="row"><select id="qMeal"><option>Breakfast</option><option>Lunch</option><option>Dinner</option><option>Snack</option></select><button class="pri" id="qAdd">Add</button></div></details></section>'+
   '<section class="card wide"><h2>Favorites &amp; saved meals</h2><div class="chips" id="fFavs"></div></section>'+
   '<section class="card wide"><h2>Food log</h2><div id="foodDay"></div></section>'+
   '<section class="card wide"><h2>Advanced stats <span class="pill pro">PRO</span></h2><div id="fStats"></div></section><p class="disc">Food data from Open Food Facts (openfoodfacts.org, ODbL) and USDA FoodData Central. Values are estimates.</p></main>'+
  '<main id="tab-me" class="hide"><section class="card wide"><h2>Account &amp; Pro</h2><div id="acBox"></div></section>'+
   '<section class="card wide"><h2>🩺 Coach / Doctor</h2><div id="coachBox"></div></section><section class="card wide"><h2>Personalize</h2>'+
   '<label class="tog"><input type="checkbox" id="stProt"><span><b>💪 Strength-training protein</b><br><small>Raises your protein target to about 1.8 g per kg of body weight (if higher than your plan).</small></span></label>'+
   '<label class="tog needpro"><input type="checkbox" id="stEds"><span><b>🦴 Joint-friendly mode (EDS / hypermobility)</b> <span class="pill pro">PRO</span><br><small>Suggests gentler swaps for today\'s exercises.</small></span></label>'+
   '<label class="tog needpro"><input type="checkbox" id="stBsf"><span><b>🩸 Blood-sugar-friendly mode</b> <span class="pill pro">PRO</span><br><small>Carb limit (~35% of calories) and a 35 g fiber target, with A1c 5.7% context.</small></span></label></section>'+
   '<section class="card wide"><h2>Reminders</h2><label class="tog"><input type="checkbox" id="stRem"><span><b>Daily reminders</b><br><small>'+(NATIVE?'Notifications on your iPhone.':'On the website these only work while the page is open.')+'</small></span></label><div class="row f"><div><label for="stWeigh">Weigh-in</label><input type="time" id="stWeigh"></div><div><label for="stMeals">Log food</label><input type="time" id="stMeals"></div></div></section>'+
   '<section class="card wide"><h2>Data</h2><div class="row"><button data-act="export">Export backup</button><button data-act="import">Import backup</button></div>'+(!NATIVE?'<div class="hint" id="installHint">Install: in Safari tap Share → <b>Add to Home Screen</b>.</div>':'')+'<div class="hint"><a href="privacy.html">Privacy</a> · <a href="support.html">Support</a> · v'+VER+'</div></section>'+
   '<p class="disc">Not medical advice. General fitness and nutrition information only. Talk to your doctor before making changes, especially with EDS, prediabetes or any health condition.</p></main>');
  document.body.insertAdjacentHTML('beforeend','<div id="pSheet" class="sheet"><div class="sbg" data-close></div><div class="sbox" id="pSheetBody"></div></div><div id="pToast" class="toast" role="status"></div>');
  // tab switching (wraps the original two-tab logic)
  tabs.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;show(b.getAttribute('data-tab'));});
  function show(t){['home','food','me','coach'].forEach(function(x){$('tab-'+x).classList.toggle('hide',x!==t);});
    if(t==='home'||t==='food'||t==='me'||t==='coach'){$('tab-nutrition').classList.add('hide');$('tab-workouts').classList.add('hide');tabs.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-tab')===t);});try{localStorage.setItem('fatLossPlanner.tab',t);}catch(e){}window.scrollTo(0,0);}
    renderAll();if(t==='coach'){CO.cur=null;renderClients();coachRefresh();}}
  window.__FLPshow=function(t){var b=tabs.querySelector('[data-tab="'+t+'"]');if(b)b.click();};
  var start=localStorage.getItem('fatLossPlanner.v2seen')?(localStorage.getItem('fatLossPlanner.tab')||'home'):'home';try{localStorage.setItem('fatLossPlanner.v2seen','1');}catch(e){}
  window.__FLPshow(start);
  // events
  document.addEventListener('click',function(e){var t=e.target.closest('[data-close],[data-go],[data-act],[data-pro],[data-add-res],[data-fav-res],[data-fav],[data-meal],[data-del],[data-qty],[data-ufav]');if(!t)return;
    if(t.hasAttribute('data-close')){closeSheet();return;}
    if(t.hasAttribute('data-go')){window.__FLPshow(t.getAttribute('data-go'));return;}
    if(t.hasAttribute('data-pro')){needPro(t.getAttribute('data-pro'))||0;if(isPro()&&NATIVE)openPaywall('');return;}
    if(t.hasAttribute('data-add-res')){addFood(lastResults[+t.getAttribute('data-add-res')]);return;}
    if(t.hasAttribute('data-fav-res')){var it=lastResults[+t.getAttribute('data-fav-res')];if(!P.favs.some(function(f){return f.name===it.name;})){P.favs.push({name:it.name,kcal:it.kcal,p:it.p,c:it.c,f:it.f,fib:it.fib||0});saveP();renderFood();toast('Saved to favorites');}return;}
    if(t.hasAttribute('data-fav')){addFood(P.favs[+t.getAttribute('data-fav')]);return;}
    if(t.hasAttribute('data-meal')){var ml=P.meals[+t.getAttribute('data-meal')];openSheet('<h3>🍱 '+esc(ml.name)+'</h3>'+ml.items.map(function(x){return '<div class="hint">'+esc(x.name)+' · '+r0(x.kcal*(x.qty||1))+' kcal</div>';}).join('')+'<button class="pri wide" id="mlAdd">Add all to '+esc(curDay)+'</button><button class="wide danger" id="mlDel">Delete saved meal</button><button class="wide ghost" data-close>Cancel</button>');
      $('mlAdd').onclick=function(){var mm=mealNow();ml.items.forEach(function(x){(P.food[curDay]=P.food[curDay]||[]).push(Object.assign({},x,{id:Math.random().toString(36).slice(2),meal:mm}));});saveP();closeSheet();renderAll();toast('Meal added');};
      $('mlDel').onclick=function(){P.meals=P.meals.filter(function(x){return x!==ml;});saveP();closeSheet();renderFood();};return;}
    if(t.hasAttribute('data-del')){var id=t.getAttribute('data-del');P.food[curDay]=dayFood(curDay).filter(function(x){return x.id!==id;});saveP();renderAll();return;}
    if(t.hasAttribute('data-qty')){var q=dayFood(curDay).filter(function(x){return x.id===t.getAttribute('data-qty');})[0];var v=prompt('Servings',q.qty||1);if(v!=null&&+v>0){q.qty=Math.round(+v*100)/100;saveP();renderAll();}return;}
    var a=t.getAttribute('data-act');
    if(a==='weigh'){var v2=prompt('Today\'s weight ('+unit()+')');if(v2&&+v2>0){var s=S(),lb=unit()==='kg'?+v2*LB:+v2;s.logs=s.logs.filter(function(l){return l.date!==today();});s.logs.push({date:today(),wLb:Math.round(lb*10)/10,bf:null});s.profile.weightLb=lb;localStorage.setItem('fatLossPlanner.v1',JSON.stringify(s));if(window.__FLP)window.__FLP.render();renderAll();toast('Weight logged');}}
    else if(a==='ciApply'){var c=checkinData(),s2=S();if(c.sug){s2.override=c.sug;localStorage.setItem('fatLossPlanner.v1',JSON.stringify(s2));P.checkins.push({at:Date.now(),from:c.cur,to:c.sug,rate:c.rate});P.lastCheckin=Date.now();saveP();window.__FLP.render();renderAll();toast('New target: '+c.sug+' kcal/day (change anytime in Plan)');}}
    else if(a==='ciKeep'){P.checkins.push({at:Date.now(),from:checkinData().cur,to:null});P.lastCheckin=Date.now();saveP();renderAll();toast('Check-in saved');}
    else if(a==='health')healthSync();else if(a==='restore')restore();else if(a==='apple')appleSignIn();else if(a==='email')emailSignIn();else if(a==='code')codeSignIn();
    else if(a==='signOut'){sb.auth.signOut();}else if(a==='delAcct')deleteAccount();else if(a==='syncNow'){if(needPro('Cloud sync'))pull();}
    else if(a==='export')$('exportBtn').click();else if(a==='import')$('importBtn').click();
    else if(a&&a.indexOf('co')===0&&coachAct(a,t))return;
    else if(a==='saveMeal'){var nm=prompt('Name this meal','My meal');if(nm){P.meals.push({name:nm,items:dayFood(curDay).map(function(x){return {name:x.name,kcal:x.kcal,p:x.p,c:x.c,f:x.f,fib:x.fib,qty:x.qty};})});saveP();renderFood();toast('Meal saved');}}
  });
  $('fSearch').addEventListener('input',function(){search(this.value);});
  $('fScan').onclick=scan;
  $('fDate').onchange=function(){if(this.value){curDay=this.value;renderFood();}};
  $('fPrev').onclick=function(){curDay=dOf(tOf(curDay)-DAY);renderFood();};$('fNext').onclick=function(){curDay=dOf(tOf(curDay)+DAY);renderFood();};
  $('qAdd').onclick=function(){var k=+$('qK').value;if(!(k>0)){toast('Enter calories');return;}addFood({name:$('qName').value||'Quick add',kcal:k,p:+$('qP').value||0,c:+$('qC').value||0,f:+$('qF').value||0,fib:+$('qFib').value||0,meal:$('qMeal').value});['qName','qK','qP','qC','qF','qFib'].forEach(function(i){$(i).value='';});};
  $('qMeal').value=mealNow();
  $('stProt').onchange=function(){P.set.strengthProt=this.checked;saveP();renderAll();};
  [['stEds','eds','Joint-friendly mode'],['stBsf','bsf','Blood-sugar-friendly mode']].forEach(function(a){$(a[0]).onchange=function(){if(this.checked&&!needPro(a[2])){this.checked=false;return;}P.set[a[1]]=this.checked;saveP();renderAll();};});
  $('stRem').onchange=function(){P.set.remind.on=this.checked;saveP();scheduleReminders();};
  ['stWeigh','stMeals'].forEach(function(id){$(id).onchange=function(){P.set.remind[id==='stWeigh'?'weigh':'meals']=this.value;saveP();scheduleReminders();};});
  window.addEventListener('resize',function(){if(!$('tab-home').classList.contains('hide'))drawTrend($('trendCv'),trend());});
  $('themeBtn').addEventListener('click',function(){setTimeout(renderAll,0);});
  renderAll();
}
build();
if(NP){loadProducts();NP.getPurchases({productType:'inapp'}).then(function(r){applyPurchases(r.purchases||[]);}).catch(function(){});}
if(NATIVE)document.body.classList.add('native');
if('serviceWorker' in navigator&&!NATIVE&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(function(){});
setInterval(function(){if(trialLeft()===0&&P.pro.trialStart&&!P.pro.owned)renderAll();},60000);
window.__FLPLUS={get state(){return P;},isPro:isPro,trialLeft:trialLeft,totals:totals,targets:targets,trend:trend,streak:streak,checkin:checkinData,addFood:addFood,ver:VER};
})();
