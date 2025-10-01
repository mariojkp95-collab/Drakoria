// ===== Base
const tile=64, cols=10, rows=10;
const c = document.getElementById('game');
const ctx = c.getContext('2d');

// Helper per selezione sicura
const $ = (id) => document.getElementById(id);

// HUD refs
const hpText = $('hptext');
const hpFill = $('hpfill');
const mpText = $('mptext');
const mpFill = $('mpfill');
const coinsEl= $('coins');
const potsEl = $('pots');
const lvlEl  = $('lvl');
const xpFill = $('xpfill');
const xpText = $('xptext');
const optPathHighlight = $('optPathHighlight');

// Sidebar / toggles
const minimapBox       = $('minimapBox');
const questPanel       = $('questPanel');
const btnHideMinimap   = $('btnHideMinimap');
const btnHideQuest     = $('btnHideQuest');
const btnToggleMinimap = $('btnToggleMinimap');
const btnToggleQuest   = $('btnToggleQuest');
const btnQuestReset    = $('btnQuestReset');

// Death / Title
const deathScreen = $('deathScreen');
const titleScreen = $('titleScreen');
const btnStart    = $('btnStart');
const btnMenu     = $('btnMenu');
const btnReset    = $('btnReset');
const btnRespawn  = $('btnRespawn');

// Attacca i listener del menu
if (btnStart)   btnStart.onclick   = () => { titleScreen.classList.remove('show'); titleScreen.style.display='none'; };
if (btnMenu)    btnMenu.onclick    = () => { deathScreen.classList.remove('show'); titleScreen.classList.add('show'); };
if (btnReset)   btnReset.onclick   = () => { localStorage.removeItem('dreamtale_save_v12_1'); localStorage.removeItem('dreamtale_ui_v12_1'); location.reload(); };
if (btnRespawn) btnRespawn.onclick = respawn; // funzione definita più sotto

// EXP / LVL
const MAX_LVL=99, XP_COIN=5, XP_POTION=2, XP_SLIME=15;
function expNeededFor(level){ return Math.floor(50*Math.pow(level,1.5)); }

// Combat/player
const ATTACK_CD_MS=400, ENEMY_BASE_HP=25, PLAYER_ATK_MIN=5, PLAYER_ATK_MAX=9;
let lastAttackTs = 0;

// Enemy AI
const AGGRO_RANGE=4, AGGRO_MEMORY_MS=2500, ENEMY_REPATH_MS=400;
const ENEMY_ATK_MIN=3, ENEMY_ATK_MAX=6, ENEMY_ATK_CD_MS=900;

// Drops
const DROP_COIN_CHANCE=.35, DROP_POTION_CHANCE=.10;

// Quest (30 monete → +30 EXP)
const QUEST_TARGET=30, QUEST_REWARD_XP=30;
let questCount=0, questDone=false;
const qfill=$('qfill'), qcount=$('qcount'), qmax=$('qmax');
$('qtarget').textContent = QUEST_TARGET;
qmax.textContent         = QUEST_TARGET;
$('qreward').textContent = QUEST_REWARD_XP;

// Minimap
const mm   = $('minimap');
const mmctx= mm ? mm.getContext('2d') : null;

// Assets
const IMGS={}, sources={
  grass:'assets/grass.png', tree:'assets/tree.png', player:'assets/player.png',
  enemy:'assets/enemy.png', coin:'assets/coin.png', potion:'assets/potion.png'
};
function loadImages(list){
  return Promise.all(Object.entries(list).map(([k,src])=>new Promise((res,rej)=>{
    const im=new Image(); im.onload=()=>{IMGS[k]=im;res()}; im.onerror=rej; im.src=src;
  })));
}

// RNG & Map
function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296 } }
let seededRand=mulberry32(1337);
let map=[];
function genMapFromSeed(seed){
  seededRand=mulberry32(seed);
  map=Array.from({length:rows},()=>Array.from({length:cols},()=>0));
  for(let i=0;i<12;i++){
    const x=Math.floor(seededRand()*cols), y=Math.floor(seededRand()*rows);
    if(x===0&&y===0) continue; map[y][x]=1;
  }
}
function isWalkableTile(x,y){return x>=0&&y>=0&&x<cols&&y<rows&&map[y][x]===0}

// State & Save
const SAVE_KEY='dreamtale_save_v12_1';
const UI_KEY  ='dreamtale_ui_v12_1';
const player={x:2,y:2,hp:100,maxHp:100,mp:100,maxMp:100,coins:0,potions:0,lvl:1,exp:0};
let seed=1337, enemies=[], coinsArr=[], potions=[], walking=false, pathQueue=[];

// UI state save (minimappa/quest visibilità)
function loadUIState(){
  try{
    const raw=localStorage.getItem(UI_KEY); if(!raw) return;
    const s=JSON.parse(raw);
    if(s.minimapCollapsed) minimapBox.classList.add('collapsed');
    if(s.questCollapsed)   questPanel.classList.add('collapsed');
  }catch(_){}
}
function saveUIState(){
  try{
    localStorage.setItem(UI_KEY, JSON.stringify({
      minimapCollapsed: minimapBox.classList.contains('collapsed'),
      questCollapsed:   questPanel.classList.contains('collapsed')
    }));
  }catch(_){}
}

function saveGame(){
  const data={seed,player,questCount,questDone};
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(data)); }catch(e){}
}
function loadGame(){
  try{
    const raw=localStorage.getItem(SAVE_KEY); if(!raw) return false;
    const d=JSON.parse(raw); if(!d||!d.player) return false;
    seed=d.seed??1337; Object.assign(player,d.player);
    questCount=d.questCount??0; questDone=d.questDone??false;
    return true;
  }catch(e){ return false; }
}

// Helpers
function isEnemyAt(x,y){ return enemies.some(e=>e.x===x && e.y===y); }
function isWalkableDynamic(x,y){ return isWalkableTile(x,y) && !isEnemyAt(x,y); }
function randEmpty(exclude=[]){
  let tries=0;
  while(tries<500){
    const x=Math.floor(seededRand()*cols), y=Math.floor(seededRand()*rows);
    if(!isWalkableTile(x,y)) {tries++;continue}
    if(x===player.x&&y===player.y) {tries++;continue}
    if(exclude.some(p=>p.x===x&&p.y===y)) {tries++;continue}
    return {x,y};
  } return {x:0,y:0};
}

// Spawns
function spawnEnemy(){
  const pos=randEmpty([...enemies,...coinsArr,...potions]);
  const maxHp=ENEMY_BASE_HP+Math.floor(player.lvl*1.2);
  enemies.push({x:pos.x,y:pos.y,hp:maxHp,maxHp,lastAtk:0,ai:'idle',aggroUntil:0,path:[],nextRepath:0});
}
function spawnAll(){
  enemies=[]; coinsArr=[]; potions=[];
  for(let i=0;i<3;i++) spawnEnemy();
  for(let i=0;i<6;i++) coinsArr.push(randEmpty([...coinsArr,...enemies]));
  for(let i=0;i<2;i++) potions.push(randEmpty([...coinsArr,...enemies,...potions]));
}

// UI updates
function updateHUD(){
  const hpR=Math.max(0,Math.min(1,player.hp/player.maxHp));
  const mpR=Math.max(0,Math.min(1,player.mp/player.maxMp));
  hpText.textContent=`${player.hp}/${player.maxHp}`; hpFill.style.width=`${hpR*100}%`;
  mpText.textContent=`${player.mp}/${player.maxMp}`; mpFill.style.width=`${mpR*100}%`;
  coinsEl.textContent=player.coins; potsEl.textContent=player.potions; lvlEl.textContent=player.lvl;
  const need=expNeededFor(player.lvl); const r=(player.lvl>=MAX_LVL)?1:player.exp/need;
  xpFill.style.width=(Math.max(0,Math.min(1,r))*100)+'%'; xpText.textContent=`EXP ${Math.floor(r*100)}%`;
  qcount.textContent=questCount;
  qfill.style.width=Math.min(100,(questCount/QUEST_TARGET*100))+'%';
}

// Quest reset/test
if (btnQuestReset) btnQuestReset.onclick = ()=>{
  questCount=0; questDone=false; updateHUD(); saveGame();
};

// Gain EXP
function gainExp(n){
  if(player.lvl>=MAX_LVL) return;
  player.exp+=n;
  while(player.lvl<MAX_LVL && player.exp>=expNeededFor(player.lvl)){
    player.exp-=expNeededFor(player.lvl); player.lvl++;
  }
  updateHUD(); saveGame();
}

// Draw
function draw(){
  ctx.clearRect(0,0,c.width,c.height);
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      ctx.drawImage(IMGS.grass,x*tile,y*tile,tile,tile);
      if(map[y][x]===1) ctx.drawImage(IMGS.tree,x*tile,y*tile,tile,tile);
    }
  }
  if(optPathHighlight && optPathHighlight.checked && pathQueue.length){
    ctx.save(); ctx.globalAlpha=.25; ctx.fillStyle='#60a5fa';
    pathQueue.forEach(p=>ctx.fillRect(p.x*tile,p.y*tile,tile,tile));
    ctx.restore();
  }
  coinsArr.forEach(o=>ctx.drawImage(IMGS.coin,o.x*tile+8,o.y*tile+8,tile-16,tile-16));
  potions.forEach(o=>ctx.drawImage(IMGS.potion,o.x*tile+8,o.y*tile+4,tile-16,tile-16));
  enemies.forEach(e=>{
    ctx.drawImage(IMGS.enemy,e.x*tile,e.y*tile,tile,tile);
    const w=tile-10,h=6,x=e.x*tile+5,y=e.y*tile+4;
    ctx.fillStyle='#0b1224';ctx.fillRect(x,y,w,h);
    const ratio=Math.max(0,e.hp/e.maxHp);
    ctx.fillStyle='#ef4444';ctx.fillRect(x,y,Math.floor(w*ratio),h);
  });
  ctx.drawImage(IMGS.player,player.x*tile,player.y*tile,tile,tile);
  drawMinimap();
}

// Minimap
function drawMinimap(){
  if(!mmctx) return;
  const w=mm.width,h=mm.height,sx=w/cols,sy=h/rows;
  mmctx.clearRect(0,0,w,h);
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      mmctx.fillStyle=(map[y][x]===1)?'#334155':'#1e293b';
      mmctx.fillRect(x*sx,y*sy,sx,sy);
    }
  }
  mmctx.fillStyle='#facc15'; coinsArr.forEach(o=>mmctx.fillRect(o.x*sx+1,o.y*sy+1,sx-2,sy-2));
  mmctx.fillStyle='#22c55e'; potions.forEach(o=>mmctx.fillRect(o.x*sx+1,o.y*sy+1,sx-2,sy-2));
  mmctx.fillStyle='#ef4444'; enemies.forEach(e=>mmctx.fillRect(e.x*sx+1,e.y*sy+1,sx-2,sy-2));
  mmctx.fillStyle='#60a5fa'; mmctx.fillRect(player.x*sx+1,player.y*sy+1,sx-2,sy-2);
}

// Collect
function onCoinPickup(){
  player.coins++; gainExp(XP_COIN);
  if(!questDone){
    questCount = Math.min(QUEST_TARGET, questCount+1);
    if(questCount===QUEST_TARGET){ questDone=true; gainExp(QUEST_REWARD_XP); }
  }
  updateHUD(); saveGame();
}
function onPotionPickup(){ player.potions++; player.hp=Math.min(player.maxHp,player.hp+10); gainExp(XP_POTION); updateHUD(); saveGame(); }
function collectAt(x,y){
  for(let i=coinsArr.length-1;i>=0;i--) if(coinsArr[i].x===x&&coinsArr[i].y===y){ coinsArr.splice(i,1); onCoinPickup(); }
  for(let i=potions.length-1;i>=0;i--) if(potions[i].x===x&&potions[i].y===y){ potions.splice(i,1); onPotionPickup(); }
}

// Combat
function now(){return Date.now()}
function canAttack(ts){return (ts-lastAttackTs)>=ATTACK_CD_MS}
function dmgRoll(){return Math.floor(PLAYER_ATK_MIN+Math.random()*(PLAYER_ATK_MAX-PLAYER_ATK_MIN+1))}
function attack(enemy,ts){
  if(!canAttack(ts)) return;
  lastAttackTs=ts;
  enemy.hp=Math.max(0,enemy.hp-dmgRoll());
  if(enemy.hp===0){
    if(Math.random()<DROP_COIN_CHANCE) coinsArr.push({x:enemy.x,y:enemy.y});
    else if(Math.random()<DROP_POTION_CHANCE) potions.push({x:enemy.x,y:enemy.y});
    gainExp(XP_SLIME);
    const np=randEmpty([...enemies,...coinsArr,...potions]);
    enemy.x=np.x; enemy.y=np.y;
    enemy.maxHp=ENEMY_BASE_HP+Math.floor(player.lvl*1.2); enemy.hp=enemy.maxHp;
  }
  draw(); saveGame();
}

// Movement
function stepTo(nx,ny){
  if(!isWalkableDynamic(nx,ny)) return;
  player.x=nx; player.y=ny; collectAt(nx,ny);
  updateHUD(); draw(); saveGame();
}

// Input
function canvasToTileFromEvent(evt){
  const clientX=evt.clientX ?? (evt.touches?.[0]?.clientX) ?? (evt.changedTouches?.[0]?.clientX);
  const clientY=evt.clientY ?? (evt.touches?.[0]?.clientY) ?? (evt.changedTouches?.[0]?.clientY);
  const r=c.getBoundingClientRect(); const sx=(clientX-r.left)*(c.width/r.width), sy=(clientY-r.top)*(c.height/r.height);
  return {tx:Math.floor(sx/tile), ty:Math.floor(sy/tile), ts:(evt.timeStamp||Date.now())};
}
function handleTap(tx,ty,ts){
  const target=enemies.find(e=>e.x===tx&&e.y===ty&&Math.abs(e.x-player.x)+Math.abs(e.y-player.y)===1);
  if(target){ attack(target,ts); return; }
  const path=findPath(player.x,player.y,tx,ty,true);
  if(path && path.length){ pathQueue=path; walking=true; }
}
c.addEventListener('click',e=>{ if(deathScreen.classList.contains('show')) return; const {tx,ty,ts}=canvasToTileFromEvent(e); handleTap(tx,ty,ts); });

// Death
function onDeath(){ deathScreen.classList.add('show'); walking=false; pathQueue.length=0; }
function respawn(){ player.hp=player.maxHp; player.mp=player.maxMp; player.x=2; player.y=2; spawnAll(); updateHUD(); draw(); saveGame(); deathScreen.classList.remove('show'); }

// Toggles
btnHideMinimap.onclick=()=>{ minimapBox.classList.add('collapsed'); saveUIState(); };
btnHideQuest.onclick  =()=>{ questPanel.classList.add('collapsed'); saveUIState(); };
btnToggleMinimap.onclick=()=>{ minimapBox.classList.toggle('collapsed'); saveUIState(); };
btnToggleQuest.onclick  =()=>{ questPanel.classList.toggle('collapsed'); saveUIState(); };

// Init
(async function(){
  await loadImages(sources);
  loadUIState();
  const loaded=loadGame();
  seed = loaded ? seed : Math.floor(Math.random()*1e9);
  genMapFromSeed(seed);
  spawnAll();
  updateHUD(); draw();
})();
