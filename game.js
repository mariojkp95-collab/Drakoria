const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const player = new Image();
player.src = "assets/player.png";

const enemy = new Image();
enemy.src = "assets/enemy.png";

const coin = new Image();
coin.src = "assets/coin.png";

const potion = new Image();
potion.src = "assets/potion.png";

let playerX = 100, playerY = 100;
let score = 0;
let hp = 100;

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(player, playerX, playerY, 32, 32);
  ctx.fillStyle = "white";
  ctx.fillText("HP: " + hp, 10, 20);
  ctx.fillText("Punteggio: " + score, 10, 40);
}
function movePlayer(dir) {
  if (dir === 'up') playerY -= 10;
  if (dir === 'down') playerY += 10;
  if (dir === 'left') playerX -= 10;
  if (dir === 'right') playerX += 10;
  draw();
}
player.onload = draw;
