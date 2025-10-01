
const tile = 64;
const cols = 10;
const rows = 10;
const c = document.getElementById('game');
const ctx = c.getContext('2d');

const hpEl = document.getElementById('hp');
const coinsEl = document.getElementById('coins');
const potsEl = document.getElementById('pots');

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

// Map: 0 grass, 1 tree
const map = Array.from({length:rows}, (_,y)=>Array.from({length:cols},(_,x)=>0));
[[1,3],[2,6],[4,2],[5,5],[6,8],[8,1]].forEach(([y,x])=>map[y][x]=1);

const player = {x:2,y:2,hp:100,coins:0,potions:0};
let enemies = [];
let coins = [];
let potions = [];

function isWalkable(x,y){
  return x>=0 && y>=0 && x<cols && y<rows && map[y][x]===0;
}

function randEmpty(exclude=[]) {
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

function draw(){
  for(let y=0;y<rows;y++){
    for(let x=0;x<cols;x++){
      ctx.drawImage(IMGS.grass, x*tile, y*tile, tile, tile);
      if(map[y][x]===1) ctx.drawImage(IMGS.tree, x*tile, y*tile, tile, tile);
    }
  }
  coins.forEach(o=>ctx.drawImage(IMGS.coin, o.x*tile+8, o.y*tile+8, tile-16, tile-16));
  potions.forEach(o=>ctx.drawImage(IMGS.potion, o.x*tile+8, o.y*tile+4, tile-16, tile-16));
  enemies.forEach(e=>ctx.drawImage(IMGS.enemy, e.x*tile, e.y*tile, tile, tile));
  ctx.drawImage(IMGS.player, player.x*tile, player.y*tile, tile, tile);
}

function updateHUD(){
  hpEl.textContent = player.hp;
  coinsEl.textContent = player.coins;
  potsEl.textContent = player.potions;
}

function collectAt(x,y){
  for(let i=coins.length-1;i>=0;i--) if(coins[i].x===x && coins[i].y===y){ coins.splice(i,1); player.coins++; }
  for(let i=potions.length-1;i>=0;i--) if(potions[i].x===x && potions[i].y===y){ potions.splice(i,1); player.potions++; player.hp = Math.min(100, player.hp+10); }
}

function movePlayer(dx,dy){
  const nx = player.x + dx, ny = player.y + dy;
  if(!isWalkable(nx,ny)) return;
  player.x = nx; player.y = ny;
  collectAt(nx,ny);
  enemies.forEach((e)=>{
    if(e.x===nx && e.y===ny){
      player.hp = Math.max(0, player.hp-10);
      const np = randEmpty([...enemies, ...coins, ...potions]);
      e.x = np.x; e.y = np.y;
    }
  });
  updateHUD();
  draw();
}

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

function initControls(){
  document.querySelectorAll('#controls button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const dir = btn.dataset.dir;
      if(dir==='up') movePlayer(0,-1);
      if(dir==='down') movePlayer(0,1);
      if(dir==='left') movePlayer(-1,0);
      if(dir==='right') movePlayer(1,0);
    });
  });
  let sx=0, sy=0;
  c.addEventListener('touchstart', e=>{ const t=e.changedTouches[0]; sx=t.clientX; sy=t.clientY; });
  c.addEventListener('touchend', e=>{ const t=e.changedTouches[0]; const dx=t.clientX-sx; const dy=t.clientY-sy;
    if(Math.abs(dx)>Math.abs(dy)){ if(dx>20) movePlayer(1,0); else if(dx<-20) movePlayer(-1,0); }
    else { if(dy>20) movePlayer(0,1); else if(dy<-20) movePlayer(0,-1); }
  });
}

loadImages(sources).then(()=>{
  spawnAll();
  draw();
  updateHUD();
  initControls();
  setInterval(moveEnemies, 1100);
}).catch(()=>{
  alert('Errore nel caricamento delle immagini. Controlla la cartella assets/.');
});
