// ==== Config base
const tile=64, cols=10, rows=10;
const c=document.getElementById('game');
const ctx=c.getContext('2d');

// HUD refs (stile Nostale)
const hpText = document.getElementById('hptext');
const hpFill = document.getElementById('hpfill');
const mpText = document.getElementById('mptext');
const mpFill = document.getElementById('mpfill');
const coinsEl= document.getElementById('coins');
const potsEl = document.getElementById('pots');
const lvlEl  = document.getElementById('lvl');

// EXP bar
const xpFill = document.getElementById('xpfill');
const xpText = document.getElementById('xptext');

// Overlays
const titleScreen = document.getElementById('titleScreen');
const deathScreen = document.getElementById('deathScreen');
const btnStart = document.getElementById('btnStart');
const btnOptions = document.getElementById('btnOptions');
const btnReset = document.getElementById('btnReset');
const btnRespawn = document.getElementById('btnRespawn');
const btnMenu = document.getElementById('btnMenu');
const optionsBox = document.getElementById('optionsBox');
const optSfx = document.getElementById('optSfx');

// XP / LVL
const MAX_LVL=99, XP_COIN=5, XP_POTION=2, XP_SLIME=15;
function expNeededFor(level){ return Math.floor(50 * Math.pow(level, 1.5)); }

// Combat
const ATTACK_CD_MS=400, ENEMY_BASE_HP=25, PLAYER_ATK_MIN=5, PLAYER_ATK_MAX=9;

// Drops
const DROP_COIN_CHANCE=0.35, DROP_POTION_CHANCE=0.10;

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

// RNG seed
function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296 } }
let seededRand=mulberry32(1337);

// Mappa
let map=[];
function genMapFromSeed(seed){
  seededRand=mulberry32(seed);
  map=Array.from({length:rows},()=>Array.from({length:cols},()=>0));
  for(let i=0;i<12;i++){
    const x=Math.floor(seededRand()*cols), y=Math.floor(seededRand()*rows);
    if(x===0&&y===0) continue; map[y][x]=1;
  }
}
function isWalkable(x,y){return x>=0 && y>=0 && x<cols && y<rows && map[y][x]===0}

// Stato & Save
const SAVE_KEY='dreamtale_save_v3';
const player={x:2,y:2,hp:100,maxHp:100,mp:100,maxMp:100,coins:0,potions:0,lvl:1,exp:0};
let seed=1337, enemies=[], coins=[], potions=[], lastAttackTs=0;
let walking=false, pathQueue=[];

function saveGame(){
  const data={ seed, player:{x:player.x,y:player.y,hp:player.hp,maxHp:player.maxHp,mp:player.mp,maxMp:player.maxMp,coins:player.coins,potions:player.potions,lvl:player.lvl,exp:player.exp} };
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(data)); }catch(e){}
}
function loadGame(){
  try{
    const raw=localStorage.getItem(SAVE_KEY); if(!raw) return false;
    const data=JSON.parse(raw); if(!data||!data.player) return false;
    seed=data.seed??1337; Object.assign(player,data.player); return true;
  }catch(e){ return false; }
}

// Spawn helpers
function randEmpty(exclude=[]){
  let tries=0;
  while(tries<500){
    const x=Math.floor(seededRand()*cols), y=Math.floor(seededRand()*rows);
    if(!isWalkable(x,y)) {tries++;continue}
    if(x===player.x&&y===player.y){tries++;continue}
    if(exclude.some(p=>p.x===x&&p.y===y)){tries++;continue}
    return {x,y};
  } return {x:0,y:0};
}
function spawnEnemy(){
  const pos=randEmpty([...enemies,...coins,...potions]);
  const maxHp=ENEMY_BASE_HP+Math.floor(player.lvl*1.2);
  enemies.push({x:pos.x,y:pos.y,hp:maxHp,maxHp});
}
function spawnAll(){
  enemies=[]; coins=[]; potions=[];
  for(let i=0;i<3;i++) spawnEnemy();
  for(let i=0;i<6;i++) coins.push(randEmpty([...coins,...enemies]));
  for(let i=0;i<2;i++) potions.push(randEmpty([...coins,...enemies,...potions]));
}

// HUD
function xpRatio(){return (player.lvl>=MAX_LVL)?1:Math.max(0,Math.min(1,player.exp/expNeededFor(player.lvl)))}
function gainExp(n){
  if(player.lvl>=MAX_LVL) return;
  player.exp+=n;
  while(player.lvl<MAX_LVL && player.exp>=expNeededFor(player.lvl)){
    player.exp-=expNeededFor(player.lvl); player.lvl++;
  }
  updateHUD(); saveGame();
}
function updateHUD(){
  const hpR=Math.max(0,Math.min(1,player.hp/player.maxHp));
  const mpR=Math.max(0,Math.min(1,player.mp/player.maxMp));
  hpText.textContent=`${player.hp}/${player.maxHp}`;
  hpFill.style.width=`${hpR*100}%`;
  mpText.textContent=`${player.mp}/${player.maxMp}`;
  mpFill.style.width=`${mpR*100}%`;
  coinsEl.textContent=player.coins; potsEl.textContent=player.potions; lvlEl.textContent=player.lvl;
  const r=xpRatio(); xpFill.style.width=(r*100)+'%'; xpText.textContent=`EXP ${Math.floor(r*100)}%`;
}

// Draw (NO scie: resetta alpha e ridisegna tutto ad ogni frame)
function draw(){
  ctx.save();
  ctx.globalAlpha=1; // assicurati che non resti trasparenza residua
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      ctx.drawImage(IMGS.grass,x*tile,y*tile,tile,tile);
      if(map[y][x]===1) ctx.drawImage(IMGS.tree,x*tile,y*tile,tile,tile);
    }
  }
  coins.forEach(o=>ctx.drawImage(IMGS.coin,o.x*tile+8,o.y*tile+8,tile-16,tile-16));
  potions.forEach(o=>ctx.drawImage(IMGS.potion,o.x*tile+8,o.y*tile+4,tile-16,tile-16));
  enemies.forEach(e=>{
    ctx.drawImage(IMGS.enemy,e.x*tile,e.y*tile,tile,tile);
    // enemy hp bar
    const w=tile-10,h=6,x=e.x*tile+5,y=e.y*tile+4;
    ctx.fillStyle='#0b1224';ctx.fillRect(x,y,w,h);
    const ratio=Math.max(0,e.hp/e.maxHp);
    ctx.fillStyle='#ef4444';ctx.fillRect(x,y,Math.floor(w*ratio),h);
    ctx.strokeStyle='#1f2a44';ctx.strokeRect(x,y,w,h);
  });
  ctx.drawImage(IMGS.player,player.x*tile,player.y*tile,tile,tile);
  ctx.restore();
}

// Collect & collisions
function collectAt(x,y){
  for(let i=coins.length-1;i>=0;i--) if(coins[i].x===x&&coins[i].y===y){ coins.splice(i,1); player.coins++; gainExp(XP_COIN); }
  for(let i=potions.length-1;i>=0;i--) if(potions[i].x===x&&potions[i].y===y){ potions.splice(i,1); player.potions++; player.hp=Math.min(player.maxHp,player.hp+10); gainExp(XP_POTION); }
}
function handleEnemyTouch(nx,ny){
  enemies.forEach(e=>{
    if(e.x===nx&&e.y===ny){
      player.hp=Math.max(0,player.hp-10);
    }
  });
  if(player.hp<=0) onDeath();
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
    // drop
    if(Math.random()<DROP_COIN_CHANCE) coins.push({x:enemy.x,y:enemy.y});
    else if(Math.random()<DROP_POTION_CHANCE) potions.push({x:enemy.x,y:enemy.y});
    gainExp(XP_SLIME);
    // respawn
    const np=randEmpty([...enemies,...coins,...potions]);
    enemy.x=np.x; enemy.y=np.y;
    enemy.maxHp=ENEMY_BASE_HP+Math.floor(player.lvl*1.2);
    enemy.hp=enemy.maxHp;
  }
  draw(); saveGame();
}

// Movement
function stepTo(nx,ny){
  if(!isWalkable(nx,ny)) return;
  player.x=nx; player.y=ny;
  collectAt(nx,ny);
  handleEnemyTouch(nx,ny);
  updateHUD(); draw(); saveGame();
}
function findPath(sx,sy,tx,ty){
  if(!isWalkable(tx,ty)) return null;
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
      if(!isWalkable(nx,ny) || seen.has(kk)) continue;
      seen.add(kk); prev.set(kk,cur); q.push({x:nx,y:ny});
    }
  }
  return null;
}
function canvasToTileFromEvent(evt){
  const clientX = evt.clientX ?? (evt.touches?.[0]?.clientX) ?? (evt.changedTouches?.[0]?.clientX);
  const clientY = evt.clientY ?? (evt.touches?.[0]?.clientY) ?? (evt.changedTouches?.[0]?.clientY);
  const r=c.getBoundingClientRect();
  const sx=(clientX-r.left)*(c.width/r.width), sy=(clientY-r.top)*(c.height/r.height);
  return {tx:Math.floor(sx/tile), ty:Math.floor(sy/tile), ts:(evt.timeStamp||Date.now())};
}
function handleTap(tx,ty,ts){
  // attacco se adiacente
  const target=enemies.find(e=>e.x===tx&&e.y===ty&&Math.abs(e.x-player.x)+Math.abs(e.y-player.y)===1);
  if(target){ attack(target,ts); return; }
  // movimento
  const path=findPath(player.x,player.y,tx,ty);
  if(path && path.length){ pathQueue=path; walking=true; }
}
c.style.touchAction='manipulation';
c.addEventListener('pointerdown',e=>{ const {tx,ty,ts}=canvasToTileFromEvent(e); if(!deathScreen.classList.contains('show')) handleTap(tx,ty,ts); });
c.addEventListener('click',e=>{ const {tx,ty,ts}=canvasToTileFromEvent(e); if(!deathScreen.classList.contains('show')) handleTap(tx,ty,ts); });
c.addEventListener('touchend',e=>{ const {tx,ty,ts}=canvasToTileFromEvent(e); if(!deathScreen.classList.contains('show')) handleTap(tx,ty,ts); e.preventDefault(); },{passive:false});

// Timers
setInterval(()=>{
  if(walking && pathQueue.length){
    const next=pathQueue.shift(); stepTo(next.x,next.y);
    if(!pathQueue.length) walking=false;
  }
}, 110);
setInterval(()=>{
  enemies.forEach(e=>{
    const dirs=[[1,0],[-1,0],[0,1],[0,-1],[0,0]];
    const d=dirs[Math.floor(Math.random()*dirs.length)];
    const nx=e.x+d[0], ny=e.y+d[1];
    if(isWalkable(nx,ny) && !(nx===player.x && ny===player.y)){ e.x=nx; e.y=ny; }
  });
  draw();
}, 1100);

// Death handling
function onDeath(){
  // mostra overlay, blocca input
  deathScreen.classList.add('show');
  walking=false; pathQueue.length=0;
  // penalità: -10% monete (arrotonda)
  const lost=Math.floor(player.coins*0.10);
  player.coins=Math.max(0,player.coins-lost);
  saveGame();
}
btnRespawn.addEventListener('click',()=>{
  // respawn alla posizione iniziale, HP/MP pieni
  player.hp=player.maxHp; player.mp=player.maxMp;
  player.x=2; player.y=2;
  spawnAll(); updateHUD(); draw(); saveGame();
  deathScreen.classList.remove('show');
});
btnMenu.addEventListener('click',()=>{
  deathScreen.classList.remove('show');
  titleScreen.classList.add('show');
});

// Menu
btnStart.addEventListener('click',()=>{ titleScreen.classList.remove('show'); titleScreen.style.display='none'; });
btnOptions.addEventListener('click',()=> optionsBox.classList.toggle('hidden'));
btnReset.addEventListener('click',()=>{ localStorage.removeItem(SAVE_KEY); location.reload(); });

// Init
(async function init(){
  await loadImages(sources);
  const loaded=loadGame();
  seed = loaded ? seed : Math.floor(Math.random()*1e9);
  genMapFromSeed(seed);
  spawnAll(); updateHUD(); draw();
})();
