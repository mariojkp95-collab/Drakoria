const tile = 64;
const cols = 10;
const rows = 10;
const c = document.getElementById('game');
const ctx = c.getContext('2d');

const hpEl   = document.getElementById('hp');
const coinsEl= document.getElementById('coins');
const potsEl = document.getElementById('pots');
const lvlEl  = document.getElementById('lvl');
const xpFill = document.getElementById('xpfill');

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

// --- Mappa (0 = erba, 1 = albero/ostacolo)
const map = Array.from({length:rows}, ()=>Array.from({length:cols}, ()=>0));
[[1,3],[2,6],[4,2],[5,5],[6,8],[8,1]].forEach(([y,x])=>map[y][x]=1);

// --- Stato di gioco
const player = {
  x:2, y:2, hp:100,
  coins:0, potions:0,
  lvl:1, exp:0
};
let enemies = [];
let coins = [];
let potions = [];

let pathQueue = [];      // percorso corrente (array di tile)
let walking = false;     // flag camminata

// --- Funzioni EXP & livello
const MAX_LVL = 99;
function expNeededFor(level){
  // curva “dolce”, cresce col livello (puoi ritoccarla)
  return Math.floor(50 * Math.pow(level, 1.5));
}
function gainExp(amount){
  if(player.lvl >= MAX_LVL) return;
  player.exp += amount;
  while(player.exp >= expNeededFor(player.lvl) && player.lvl < MAX_LVL){
    player.exp -= expNeededFor(player.lvl);
    player.lvl++;
  }
  updateHUD();
}
function xpRatio(){
  if(player.lvl >= MAX_LVL) return 1;
  return Math.max(0, Math.min(1, player.exp / expNeededFor(player.lvl)));
}

// --- Utility mappa
function isWalkable(x,y){
  return x>=0 && y>=0 && x<cols && y<rows && map[y][x]===0;
}
function randEmpty(exclude=[]){
  let tries=0;
  while(tries<500){
    const x = Math.floor(Math.random()*cols);
    const y = Math.floor(Math.random()*rows);
    if(!isWalkable(x,y)) { tries++; continue; }
    if(x===player.x && y===player.y){ tries++; continue; }
    if(exclude.some(p=>p.x===x && p.y===y)) { tries++; continue; }
    return {x,y};
  }
  return {x:0,y:0};
}
function spawnAll(){
  enemies = []; coins = []; potions = [];
  for(let i=0;i<3;i++) enemies.push(randEmpty([...enemies]));
  for(let i=0;i<6;i++) coins.push(randEmpty([...coins, ...enemies]));
  for(let i=0;i<2;i++) potions.push(randEmpty([...coins, ...enemies, ...potions]));
}

// --- Rendering
function draw(){
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      ctx.drawImage(IMGS.grass, x*tile, y*tile, tile, tile);
      if(map[y][x]===1) ctx.drawImage(IMGS.tree, x*tile, y*tile, tile, tile);
    }
  }
  // evidenzia il path (opzionale)
  if(pathQueue.length>0){
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#60a5fa';
    pathQueue.forEach(p=>{
      ctx.fillRect(p.x*tile, p.y*tile, tile, tile);
    });
    ctx.restore();
  }
  // oggetti
  coins.forEach(o=>ctx.drawImage(IMGS.coin, o.x*tile+8, o.y*tile+8, tile-16, tile-16));
  potions.forEach(o=>ctx.drawImage(IMGS.potion, o.x*tile+8, o.y*tile+4, tile-16, tile-16));
  // nemici
  enemies.forEach(e=>ctx.drawImage(IMGS.enemy, e.x*tile, e.y*tile, tile, tile));
  // player
  ctx.drawImage(IMGS.player, player.x*tile, player.y*tile, tile, tile);
}

function updateHUD(){
  hpEl.textContent   = player.hp;
  coinsEl.textContent= player.coins;
  potsEl.textContent = player.potions;
  lvlEl.textContent  = player.lvl;
  xpFill.style.width = (xpRatio()*100).toFixed(2) + '%';
}

// --- Raccolte & collisioni
function collectAt(x,y){
  for(let i=coins.length-1;i>=0;i--){
    if(coins[i].x===x && coins[i].y===y){
      coins.splice(i,1);
      player.coins++;
      gainExp(5); // EXP per moneta
    }
  }
  for(let i=potions.length-1;i>=0;i--){
    if(potions[i].x===x && potions[i].y===y){
      potions.splice(i,1);
      player.potions++;
      player.hp = Math.min(100, player.hp+10);
      gainExp(2); // EXP per pozione
    }
  }
}
function handleEnemyCollisions(nx,ny){
  enemies.forEach((e)=>{
    if(e.x===nx && e.y===ny){
      player.hp = Math.max(0, player.hp-10);
      const np = randEmpty([...enemies, ...coins, ...potions]);
      e.x = np.x; e.y = np.y;
    }
  });
}

// --- Movimento “step-by-step”
function stepTo(nx,ny){
  if(!isWalkable(nx,ny)) return;
  player.x = nx; player.y = ny;
  collectAt(nx,ny);
  handleEnemyCollisions(nx,ny);
  updateHUD();
  draw();
}

// --- Pathfinding (BFS su griglia 4-direzioni)
function findPath(sx,sy,tx,ty){
  if(!isWalkable(tx,ty)) return null;
  const key = (x,y)=>`${x},${y}`;
  const q = [{x:sx,y:sy}];
  const prev = new Map();
  const seen = new Set([key(sx,sy)]);
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  while(q.length){
    const cur = q.shift();
    if(cur.x===tx && cur.y===ty){
      // ricostruisci path
      const path = [];
      let k = key(tx,ty);
      while(prev.has(k)){
        const p = prev.get(k);
        path.push({x:parseInt(k.split(',')[0]), y:parseInt(k.split(',')[1])});
        k = key(p.x,p.y);
      }
      path.reverse();
      return path;
    }
    for(const d of dirs){
      const nx = cur.x + d[0], ny = cur.y + d[1];
      const kk = key(nx,ny);
      if(!isWalkable(nx,ny) || seen.has(kk)) continue;
      seen.add(kk);
      prev.set(kk, cur);
      q.push({x:nx,y:ny});
    }
  }
  return null;
}

// --- Click/tap per spostarsi
function canvasToTile(clientX, clientY){
  const r = c.getBoundingClientRect();
  const sx = (clientX - r.left) * (c.width / r.width);
  const sy = (clientY - r.top)  * (c.height/ r.height);
  const tx = Math.floor(sx / tile);
  const ty = Math.floor(sy / tile);
  return {tx,ty};
}
c.addEventListener('click', (e)=>{
  const {tx,ty} = canvasToTile(e.clientX, e.clientY);
  const path = findPath(player.x, player.y, tx, ty);
  if(path && path.length){
    pathQueue = path; walking = true;
  }
});
// touch end (per Safari iOS a volte click non basta)
c.addEventListener('touchend', (e)=>{
  const t = e.changedTouches[0];
  const {tx,ty} = canvasToTile(t.clientX, t.clientY);
  const path = findPath(player.x, player.y, tx, ty);
  if(path && path.length){
    pathQueue = path; walking = true;
  }
});

// Esegui i passi del percorso lentamente
setInterval(()=>{
  if(!walking || pathQueue.length===0) return;
  const next = pathQueue.shift();
  stepTo(next.x, next.y);
  if(pathQueue.length===0) walking = false;
}, 160);

// Nemici si muovono casualmente
function moveEnemies(){
  enemies.forEach(e=>{
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[0,0]];
    const d = dirs[Math.floor(Math.random()*dirs.length)];
    const nx = e.x + d[0], ny = e.y + d[1];
    if(isWalkable(nx,ny) && !(nx===player.x && ny===player.y)){
      e.x = nx; e.y = ny;
    }
  });
  draw();
}
setInterval(moveEnemies, 1100);

// Avvio
loadImages(sources).then(()=>{
  spawnAll();
  updateHUD();
  draw();
}).catch(()=>{
  alert('Errore caricamento immagini (controlla la cartella assets/).');
});
