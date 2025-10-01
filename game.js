// === Config base
const tile = 64, cols = 10, rows = 10;
const c = document.getElementById('game');
const ctx = c.getContext('2d');

// HUD refs
const hpEl   = document.getElementById('hptext');
const hpFill = document.getElementById('hpfill');
const coinsEl= document.getElementById('coins');
const potsEl = document.getElementById('pots');
const lvlEl  = document.getElementById('lvl');
const xpFill = document.getElementById('xpfill');
const xpText = document.getElementById('xptext');
const levelUpBanner = document.getElementById('levelUpBanner');

// Title/Options
const titleScreen = document.getElementById('titleScreen');
const btnStart = document.getElementById('btnStart');
const btnOptions = document.getElementById('btnOptions');
const btnReset = document.getElementById('btnReset');
const optionsBox = document.getElementById('optionsBox');
const optSfx = document.getElementById('optSfx');
const optPathHighlight = document.getElementById('optPathHighlight');

// XP/LVL
const MAX_LVL = 99;
const XP_COIN = 5;
const XP_POTION = 2;
const XP_SLIME = 15;

function expNeededFor(level){ return Math.floor(50 * Math.pow(level, 1.5)); }

// Combat
const ATTACK_CD_MS = 400;
const ENEMY_BASE_HP = 25;
const PLAYER_ATK_MIN = 5, PLAYER_ATK_MAX = 9;

// Drops
const DROP_COIN_CHANCE   = 0.35; // 35%
const DROP_POTION_CHANCE = 0.10; // 10%

// Assets
const IMGS = {};
const sources = {
  grass: 'assets/grass.png',
  tree: 'assets/tree.png',
  player: 'assets/player.png',
  enemy: 'assets/enemy.png',
  coin: 'assets/coin.png',
  potion: 'assets/potion.png'
};

function loadImages(srcs){
  const entries = Object.entries(srcs);
  return Promise.all(entries.map(([k, src]) => new Promise((res, rej)=>{
    const im = new Image();
    im.onload = ()=>{ IMGS[k] = im; res(); };
    im.onerror = (e)=>{ console.error('Errore asset', src, e); rej(e); };
    im.src = src;
  })));
}

// === Seeded RNG per mappa (salvata)
function mulberry32(a){ return function(){ let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } }
let seededRand = mulberry32(123456);

// === Mappa: 0 erba, 1 albero. Generata da seed
let map = [];
function genMapFromSeed(seed){
  seededRand = mulberry32(seed);
  map = Array.from({length:rows}, ()=>Array.from({length:cols}, ()=>0));
  // genera qualche albero deterministico
  for(let i=0;i<12;i++){
    const x = Math.floor(seededRand()*cols);
    const y = Math.floor(seededRand()*rows);
    if(x===0&&y===0) continue;
    map[y][x] = 1;
  }
}

// Walkable
function isWalkable(x,y){ return x>=0 && y>=0 && x<cols && y<rows && map[y][x]===0; }

// Stato & salvataggio
const SAVE_KEY = 'dreamtale_save_v2';
const player = { x:2, y:2, hp:100, maxHp:100, coins:0, potions:0, lvl:1, exp:0 };
let seed = 1337;
let enemies = []; // {x,y,hp,maxHp}
let coins   = []; // {x,y}
let potions = []; // {x,y}
let lastAttackTs = 0;

function saveGame(){
  const data = {
    seed,
    player: {x:player.x,y:player.y,hp:player.hp,maxHp:player.maxHp,coins:player.coins,potions:player.potions,lvl:player.lvl,exp:player.exp}
  };
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(data)); }catch(e){}
}
function loadGame(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);
    if(!data || !data.player) return false;
    seed = data.seed ?? 1337;
    Object.assign(player, data.player);
    return true;
  }catch(e){ return false; }
}

// Rand tile libero
function randEmpty(exclude=[]){
  let tries=0;
  while(tries<500){
    const x = Math.floor(seededRand()*cols);
    const y = Math.floor(seededRand()*rows);
    if(!isWalkable(x,y)) { tries++; continue; }
    if(x===player.x && y===player.y){ tries++; continue; }
    if(exclude.some(p=>p.x===x && p.y===y)) { tries++; continue; }
    return {x,y};
  }
  return {x:0,y:0};
}

// Spawns
function spawnEnemy(){
  const pos = randEmpty([...enemies, ...coins, ...potions]);
  const maxHp = ENEMY_BASE_HP + Math.floor(player.lvl * 1.2);
  enemies.push({x:pos.x, y:pos.y, hp:maxHp, maxHp});
}
function spawnAll(){
  enemies = []; coins = []; potions = [];
  for(let i=0;i<3;i++) spawnEnemy();
  for(let i=0;i<6;i++) coins.push(randEmpty([...coins, ...enemies]));
  for(let i=0;i<2;i++) potions.push(randEmpty([...coins, ...enemies, ...potions]));
}

// HUD/XP
function xpRatio(){
  if(player.lvl >= MAX_LVL) return 1;
  return Math.max(0, Math.min(1, player.exp / expNeededFor(player.lvl)));
}
let levelUpTimer = 0;
function gainExp(amount){
  if(player.lvl >= MAX_LVL) return;
  player.exp += amount;
  while(player.lvl < MAX_LVL && player.exp >= expNeededFor(player.lvl)){
    player.exp -= expNeededFor(player.lvl);
    player.lvl++;
    // Banner LEVEL UP
    levelUpBanner.classList.add('show');
    levelUpTimer = 900; // ms
  }
  updateHUD();
  saveGame();
}
function updateHUD(){
  hpEl.textContent = `${player.hp}/${player.maxHp}`;
  hpFill.style.width = `${Math.max(0, Math.min(1, player.hp/player.maxHp))*100}%`;
  coinsEl.textContent = player.coins;
  potsEl.textContent  = player.potions;
  lvlEl.textContent   = player.lvl;
  const r = xpRatio();
  xpFill.style.width  = (r*100).toFixed(2)+'%';
  xpText.textContent  = `${Math.floor(r*100)}%`;
}

// Rendering
let pathQueue = [];
let walking   = false;

function draw(){
  // terreno
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      ctx.drawImage(IMGS.grass, x*tile, y*tile, tile, tile);
      if(map[y][x]===1) ctx.drawImage(IMGS.tree, x*tile, y*tile, tile, tile);
    }
  }
  // evidenzia path (se abilitato)
  if(optPathHighlight.checked && pathQueue.length){
    ctx.save(); ctx.globalAlpha=.25; ctx.fillStyle='#60a5fa';
    pathQueue.forEach(p=>ctx.fillRect(p.x*tile,p.y*tile,tile,tile));
    ctx.restore();
  }
  // items
  coins.forEach(o=>ctx.drawImage(IMGS.coin,   o.x*tile+8, o.y*tile+8, tile-16, tile-16));
  potions.forEach(o=>ctx.drawImage(IMGS.potion,o.x*tile+8, o.y*tile+4, tile-16, tile-16));
  // enemies + Hp bar
  enemies.forEach(e=>{
    ctx.drawImage(IMGS.enemy, e.x*tile, e.y*tile, tile, tile);
    const w = tile-10, h = 6, x = e.x*tile+5, y = e.y*tile+4;
    ctx.fillStyle = '#0b1224'; ctx.fillRect(x,y,w,h);
    const ratio = Math.max(0, e.hp/e.maxHp);
    ctx.fillStyle = '#ef4444'; ctx.fillRect(x,y,Math.floor(w*ratio),h);
    ctx.strokeStyle = '#1f2a44'; ctx.strokeRect(x,y,w,h);
  });
  // player
  ctx.drawImage(IMGS.player, player.x*tile, player.y*tile, tile, tile);
}

// Raccolte & collisioni
function collectAt(x,y){
  for(let i=coins.length-1;i>=0;i--){
    if(coins[i].x===x && coins[i].y===y){
      coins.splice(i,1);
      player.coins++; gainExp(XP_COIN);
    }
  }
  for(let i=potions.length-1;i>=0;i--){
    if(potions[i].x===x && potions[i].y===y){
      potions.splice(i,1);
      player.potions++;
      player.hp = Math.min(player.maxHp, player.hp+10);
      gainExp(XP_POTION);
    }
  }
}
function handleEnemyTouch(nx,ny){
  enemies.forEach((e)=>{
    if(e.x===nx && e.y===ny){
      player.hp = Math.max(0, player.hp-10);
      // respawn altrove
      const np = randEmpty([...enemies, ...coins, ...potions]);
      e.x=np.x; e.y=np.y;
    }
  });
}

// Attacco
function now(){ return Date.now(); }
function canAttack(){ return (now()-lastAttackTs)>=ATTACK_CD_MS; }
function dmgRoll(){ return Math.floor(PLAYER_ATK_MIN + Math.random()*(PLAYER_ATK_MAX-PLAYER_ATK_MIN+1)); }

function attack(enemy){
  if(!canAttack()) return;
  lastAttackTs = now();
  enemy.hp = Math.max(0, enemy.hp - dmgRoll());
  if(enemy.hp===0){
    // Drop casuale
    if(Math.random() < DROP_COIN_CHANCE) coins.push({x:enemy.x, y:enemy.y});
    else if(Math.random() < DROP_POTION_CHANCE) potions.push({x:enemy.x, y:enemy.y});
    gainExp(XP_SLIME);
    // Respawn
    const np = randEmpty([...enemies, ...coins, ...potions]);
    enemy.x=np.x; enemy.y=np.y;
    enemy.maxHp = ENEMY_BASE_HP + Math.floor(player.lvl*1.2);
    enemy.hp = enemy.maxHp;
  }
  draw(); saveGame();
}

// Movimento
function stepTo(nx,ny){
  if(!isWalkable(nx,ny)) return;
  player.x = nx; player.y = ny;
  collectAt(nx,ny);
  handleEnemyTouch(nx,ny);
  updateHUD(); draw(); saveGame();
}

// BFS path
function findPath(sx,sy,tx,ty){
  if(!isWalkable(tx,ty)) return null;
  const key=(x,y)=>`${x},${y}`;
  const q=[{x:sx,y:sy}], prev=new Map(), seen=new Set([key(sx,sy)]);
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  while(q.length){
    const cur=q.shift();
    if(cur.x===tx && cur.y===ty){
      const path=[]; let k=key(tx,ty);
      while(prev.has(k)){
        const p=prev.get(k); const [cx,cy]=k.split(',').map(Number);
        path.push({x:cx,y:cy}); k=key(p.x,p.y);
      }
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

// Click/Touch handler: attacco se tile adiacente con nemico, altrimenti path
function canvasToTile(clientX, clientY){
  const r=c.getBoundingClientRect();
  const sx=(clientX-r.left)*(c.width/r.width);
  const sy=(clientY-r.top) *(c.height/r.height);
  return { tx:Math.floor(sx/tile), ty:Math.floor(sy/tile) };
}
function handleTap(tx,ty){
  const target = enemies.find(e => e.x===tx && e.y===ty && Math.abs(e.x-player.x)+Math.abs(e.y-player.y)===1);
  if(target){ attack(target); return; }
  const path=findPath(player.x, player.y, tx, ty);
  if(path && path.length){ pathQueue=path; walking=true; }
}
c.addEventListener('click',  e=>{ const {tx,ty}=canvasToTile(e.clientX,e.clientY); handleTap(tx,ty); });
c.addEventListener('touchend', e=>{ const t=e.changedTouches[0]; const {tx,ty}=canvasToTile(t.clientX,t.clientY); handleTap(tx,ty); });

// Timer passi + nemici + level up banner timer
setInterval(()=>{
  if(walking && pathQueue.length){
    const next=pathQueue.shift(); stepTo(next.x,next.y);
    if(!pathQueue.length) walking=false;
  }
  if(levelUpTimer>0){
    levelUpTimer-=100;
    if(!levelUpBanner.classList.contains('show')) levelUpBanner.classList.add('show');
  } else {
    levelUpBanner.classList.remove('show');
  }
}, 100);

function moveEnemies(){
  enemies.forEach(e=>{
    const dirs=[[1,0],[-1,0],[0,1],[0,-1],[0,0]];
    const d=dirs[Math.floor(Math.random()*dirs.length)];
    const nx=e.x+d[0], ny=e.y+d[1];
    if(isWalkable(nx,ny) && !(nx===player.x && ny===player.y)){
      e.x=nx; e.y=ny;
    }
  });
  draw();
}
setInterval(moveEnemies, 1100);

// Title screen handlers
btnStart.addEventListener('click', ()=>{
  titleScreen.classList.remove('show');
});
btnOptions.addEventListener('click', ()=> optionsBox.classList.toggle('hidden'));
btnReset.addEventListener('click', ()=>{
  localStorage.removeItem(SAVE_KEY);
  location.reload();
});

// Avvio
(async function init(){
  await loadImages(sources);
  const loaded = loadGame(); // se c'è un salvataggio
  seed = loaded ? seed : Math.floor(Math.random()*1e9);
  genMapFromSeed(seed);
  spawnAll();
  updateHUD(); draw();
})();
