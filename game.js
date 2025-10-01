// ===== Base
const tile=64, cols=10, rows=10;
const c=document.getElementById('game'), ctx=c.getContext('2d');

// HUD refs
const hpText=hptext, hpFill=hpfill, mpText=mptext, mpFill=mpfill;
const coinsEl=coins, potsEl=pots, lvlEl=lvl;
const xpFill=xpfill, xpText=xptext;
const optPathHighlight=document.getElementById('optPathHighlight');

// Sidebar / toggles
const minimapBox=document.getElementById('minimapBox');
const questPanel=document.getElementById('questPanel');
const btnHideMinimap=document.getElementById('btnHideMinimap');
const btnHideQuest=document.getElementById('btnHideQuest');
const btnToggleMinimap=document.getElementById('btnToggleMinimap');
const btnToggleQuest=document.getElementById('btnToggleQuest');
const btnQuestReset=document.getElementById('btnQuestReset');

// Death / Title
const deathScreen=document.getElementById('deathScreen');
const titleScreen=document.getElementById('titleScreen');
document.getElementById('btnStart').onclick=()=>{titleScreen.classList.remove('show');titleScreen.style.display='none';};
document.getElementById('btnMenu').onclick = ()=>{deathScreen.classList.remove('show');titleScreen.classList.add('show');};
document.getElementById('btnReset').onclick=()=>{ localStorage.removeItem('dreamtale_save_v12'); location.reload(); };
document.getElementById('btnRespawn').onclick=respawn;

// EXP / LVL
const MAX_LVL=99, XP_COIN=5, XP_POTION=2, XP_SLIME=15;
function expNeededFor(level){ return Math.floor(50*Math.pow(level,1.5)); }

// Combat/player
const ATTACK_CD_MS=400, ENEMY_BASE_HP=25, PLAYER_ATK_MIN=5, PLAYER_ATK_MAX=9;

// Enemy AI
const AGGRO_RANGE=4, AGGRO_MEMORY_MS=2500, ENEMY_REPATH_MS=400;
const ENEMY_ATK_MIN=3, ENEMY_ATK_MAX=6, ENEMY_ATK_CD_MS=900;

// Drops
const DROP_COIN_CHANCE=.35, DROP_POTION_CHANCE=.10;

// Quest (30 monete → +30 EXP)
const QUEST_TARGET=30, QUEST_REWARD_XP=30;
let questCount=0, questDone=false;
const qfill=document.getElementById('qfill'), qcount=document.getElementById('qcount'), qmax=document.getElementById('qmax');
document.getElementById('qtarget').textContent=QUEST_TARGET; qmax.textContent=QUEST_TARGET; document.getElementById('qreward').textContent=QUEST_REWARD_XP;

// Minimap
const mm=document.getElementById('minimap'), mmctx=mm.getContext('2d');

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
const SAVE_KEY='dreamtale_save_v12';
const player={x:2,y:2,hp:100,maxHp:100,mp:100,maxMp:100,coins:0,potions:0,lvl:1,exp:0};
let seed=1337, enemies=[], coinsArr=[], potions=[], lastAttackTs=0;
let walking=false, pathQueue=[];

// UI state save (minimappa/quest visibilità)
const UI_KEY='dreamtale_ui_v12';
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
  // quest
  qcount.textContent=questCount;
  qfill.style.width=Math.min(100,(questCount/QUEST_TARGET*100))+'%';
}

function gainExp(n){
  if(player.lvl>=MAX_LVL) return;
  player.exp+=n;
  while(player.lvl<MAX_LVL && player.exp>=expNeededFor(player.lvl)){
    player.exp-=expNeededFor(player.lvl); player.lvl++;
  }
  updateHUD(); saveGame();
}

// Drawing (clear completo → no scie)
function draw(){
  ctx.save();
  ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
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
    ctx.strokeStyle='#1f2a44';ctx.strokeRect(x,y,w,h);
  });
  ctx.drawImage(IMGS.player,player.x*tile,player.y*tile,tile,tile);
  ctx.restore();
  drawMinimap();
}

// Minimap draw
function drawMinimap(){
  if(!mmctx) return;
  const w=mm.width, h=mm.height, sx=w/cols, sy=h/rows;
  mmctx.clearRect(0,0,w,h);
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      mmctx.fillStyle = (map[y][x]===1) ? '#334155' : '#1e293b';
      mmctx.fillRect(x*sx,y*sy,sx,sy);
    }
  }
  mmctx.fillStyle='#facc15'; coinsArr.forEach(o=>mmctx.fillRect(o.x*sx+1,o.y*sy+1,sx-2,sy-2));
  mmctx.fillStyle='#22c55e'; potions.forEach(o=>mmctx.fillRect(o.x*sx+1,o.y*sy+1,sx-2,sy-2));
  mmctx.fillStyle='#ef4444'; enemies.forEach(e=>mmctx.fillRect(e.x*sx+1,e.y*sy+1,sx-2,sy-2));
  mmctx.fillStyle='#60a5fa'; mmctx.fillRect(player.x*sx+1,player.y*sy+1,sx-2,sy-2);
}

// Collect & quest progress
function onCoinPickup(){
  player.coins++; gainExp(XP_COIN);
  if(!questDone){
    questCount = Math.min(QUEST_TARGET, questCount+1);
    if(questCount===QUEST_TARGET){
      questDone=true; gainExp(QUEST_REWARD_XP);
    }
  }
  updateHUD(); saveGame();
}
function onPotionPickup(){ player.potions++; player.hp=Math.min(player.maxHp,player.hp+10); gainExp(XP_POTION); updateHUD(); saveGame(); }

function collectAt(x,y){
  for(let i=coinsArr.length-1;i>=0;i--) if(coinsArr[i].x===x&&coinsArr[i].y===y){ coinsArr.splice(i,1); onCoinPickup(); }
  for(let i=potions.length-1;i>=0;i--) if(potions[i].x===x&&potions[i].y===y){ potions.splice(i,1); onPotionPickup(); }
}

// Knockback
function tryKnockback(fromX,fromY,target){
  const dx=target.x-fromX, dy=target.y-fromY, sx=Math.sign(dx), sy=Math.sign(dy);
  const kx=target.x+sx, ky=target.y+sy;
  if(isWalkableDynamic(kx,ky)){ target.x=kx; target.y=ky; }
}

// Combat
function now(){return Date.now()}
function canAttack(ts){return (ts-lastAttackTs)>=ATTACK_CD_MS}
function dmgRoll(){return Math.floor(PLAYER_ATK_MIN+Math.random()*(PLAYER_ATK_MAX-PLAYER_ATK_MIN+1))}
function attack(enemy,ts){
  if(!canAttack(ts)) return;
  lastAttackTs=ts;
  enemy.hp=Math.max(0,enemy.hp-dmgRoll());
  if(enemy.hp>0) tryKnockback(player.x,player.y,enemy);
  if(enemy.hp===0){
    if(Math.random()<DROP_COIN_CHANCE) coinsArr.push({x:enemy.x,y:enemy.y});
    else if(Math.random()<DROP_POTION_CHANCE) potions.push({x:enemy.x,y:enemy.y});
    gainExp(XP_SLIME);
    const np=randEmpty([...enemies,...coinsArr,...potions]);
    enemy.x=np.x; enemy.y=np.y;
    enemy.maxHp=ENEMY_BASE_HP+Math.floor(player.lvl*1.2); enemy.hp=enemy.maxHp;
    enemy.ai='idle'; enemy.aggroUntil=0; enemy.path=[]; enemy.nextRepath=0; enemy.lastAtk=0;
  }
  draw(); saveGame();
}
let lastAttackTs=0;

// Movement + pathfinding
function stepTo(nx,ny){
  if(!isWalkableDynamic(nx,ny)) return;
  player.x=nx; player.y=ny;
  collectAt(nx,ny);
  updateHUD(); draw(); saveGame();
}
function findPath(sx,sy,tx,ty, dynamic=true){
  const ok = dynamic ? isWalkableDynamic : isWalkableTile;
  if(!ok(tx,ty)) return null;
  const key=(x,y)=>`${x},${y}`, q=[{x:sx,y:sy}], prev=new Map(), seen=new Set([key(sx,sy)]);
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  while(q.length){
    const cur=q.shift();
    if(cur.x===tx&&cur.y===ty){
      const path=[]; let k=key(tx,ty);
      while(prev.has(k)){ const p=prev.get(k); const [cx,cy]=k.split(',').map(Number); path.push({x:cx,y:cy}); k=key(p.x,p.y); }
      path.reverse(); return path;
    }
    for(const d of dirs){
      const nx=cur.x+d[0], ny=cur.y+d[1], kk=key(nx,ny);
      if(!ok(nx,ny) || seen.has(kk)) continue;
      seen.add(kk); prev.set(kk,cur); q.push({x:nx, y:ny});
    }
  }
  return null;
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
c.style.touchAction='manipulation';
c.addEventListener('pointerdown',e=>{ if(deathScreen.classList.contains('show')) return; const {tx,ty,ts}=canvasToTileFromEvent(e); handleTap(tx,ty,ts); });
c.addEventListener('click',e=>{ if(deathScreen.classList.contains('show')) return; const {tx,ty,ts}=canvasToTileFromEvent(e); handleTap(tx,ty,ts); });
c.addEventListener('touchend',e=>{ if(deathScreen.classList.contains('show')) return; const {tx,ty,ts}=canvasToTileFromEvent(e); handleTap(tx,ty,ts); e.preventDefault(); },{passive:false});

// Enemy AI & attacks
function enemyAdjAttack(e, ts){
  if(Math.abs(e.x-player.x)+Math.abs(e.y-player.y)===1 && (ts - e.lastAtk)>=ENEMY_ATK_CD_MS){
    e.lastAtk=ts;
    const dmg = Math.floor(ENEMY_ATK_MIN + Math.random()*(ENEMY_ATK_MAX-ENEMY_ATK_MIN+1));
    player.hp = Math.max(0, player.hp - dmg);
    tryKnockback(e.x,e.y,player);
    if(player.hp<=0) onDeath();
  }
}
function enemyAITick(ts){
  enemies.forEach(e=>{
    const dist=Math.abs(e.x-player.x)+Math.abs(e.y-player.y);
    if(dist<=AGGRO_RANGE){ e.ai='aggro'; e.aggroUntil=ts+AGGRO_MEMORY_MS; }
    else if(e.ai==='aggro' && ts>e.aggroUntil){ e.ai='idle'; e.path=[]; }
    enemyAdjAttack(e,ts);
    if(e.ai==='aggro'){
      if(ts>=e.nextRepath){
        const candidates=[[1,0],[-1,0],[0,1],[0,-1]]
          .map(d=>({x:player.x-d[0],y:player.y-d[1]}))
          .filter(p=>isWalkableTile(p.x,p.y)&&!isEnemyAt(p.x,p.y)&&!(p.x===player.x&&p.y===player.y));
        const target=candidates[0]||{x:player.x,y:player.y};
        e.path=findPath(e.x,e.y,target.x,target.y,false)||[];
        e.nextRepath=ts+ENEMY_REPATH_MS;
      }
      if(e.path && e.path.length){
        const step=e.path.shift();
        if(isWalkableTile(step.x,step.y) && !(step.x===player.x&&step.y===player.y) && !enemies.some(o=>o!==e && o.x===step.x && o.y===step.y)){
          e.x=step.x; e.y=step.y;
        } else { e.path=[]; }
      }
    } else if(Math.random()<0.3){
      const dirs=[[1,0],[-1,0],[0,1],[0,-1],[0,0]];
      const d=dirs[Math.floor(Math.random()*dirs.length)];
      const nx=e.x+d[0], ny=e.y+d[1];
      if(isWalkableTile(nx,ny) && !(nx===player.x&&ny===player.y) && !enemies.some(o=>o!==e && o.x===nx && o.y===ny)){
        e.x=nx; e.y=ny;
      }
    }
  });
}

// Tickers
setInterval(()=>{
  const ts=Date.now();
  if(walking && pathQueue.length){
    const peek=pathQueue[0];
    if(!isWalkableDynamic(peek.x,peek.y)){
      const dest=pathQueue[pathQueue.length-1];
      const np=findPath(player.x,player.y,dest.x,dest.y,true);
      pathQueue=(np&&np.length)?np:[]; if(!pathQueue.length) walking=false;
    } else {
      const next=pathQueue.shift(); stepTo(next.x,next.y);
      if(!pathQueue.length) walking=false;
    }
  }
  enemyAITick(ts);
  draw();
}, 120);

// Death
function onDeath(){
  deathScreen.classList.add('show');
  walking=false; pathQueue.length=0;
  const lost=Math.floor(player.coins*0.10);
  player.coins=Math.max(0,player.coins-lost);
  saveGame();
}
function respawn(){
  player.hp=player.maxHp; player.mp=player.maxMp; player.x=2; player.y=2;
  spawnAll(); updateHUD(); draw(); saveGame();
  deathScreen.classList.remove('show');
}

// Sidebar toggles (funzionanti + persistenza)
btnHideMinimap.onclick=()=>{ minimapBox.classList.add('collapsed'); saveUIState(); };
btnHideQuest.onclick  =()=>{ questPanel.classList.add('collapsed'); saveUIState(); };
btnToggleMinimap.onclick=()=>{ minimapBox.classList.toggle('collapsed'); saveUIState(); };
btnToggleQuest.onclick  =()=>{ questPanel.classList.toggle('collapsed'); saveUIState(); };

// Reset quest manuale (per testarla più volte)
btnQuestReset.onclick = ()=>{
  questCount=0; questDone=false; updateHUD(); saveGame();
};

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
