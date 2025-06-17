const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const hpBar = document.getElementById('hp-bar');
const hpText = document.getElementById('hp-text');
const xpBar = document.getElementById('xp-bar');
const xpText = document.getElementById('xp-text');
const levelText = document.getElementById('level-text');
const timerText = document.getElementById('timer-text');
const scoreText = document.getElementById('score-text');
const levelUpScreen = document.getElementById('level-up-screen');
const upgradeOptionsContainer = document.getElementById('upgrade-options');
const gameOverScreen = document.getElementById('game-over-screen');
const finalTimeText = document.getElementById('final-time');
const finalScoreText = document.getElementById('final-score');
const finalLevelText = document.getElementById('final-level');

// Game settings
let player;
let enemies = [];
let projectiles = [];
let xpOrbs = [];
let bossActive = false;
let bossSpawnedForCurrentBossWave = false; // Flag para controlar spawn único por onda de boss
let strengthWaveCount = 0; // Contador para as "ondas de fortalecimento"

let camera = {
    x: 0, y: 0, width: window.innerWidth, height: window.innerHeight,
    update: function () {
        if (player) {
            this.x = player.x - this.width / 2;
            this.y = player.y - this.height / 2;
        }
    }
};

const keysPressed = {};
let gameTime = 0;
let gameState = 'playing';
let lastTime = 0;
let deltaTime = 0;
let score = 0;

let enemySpawnTimer = 0;
// MODIFICADO: Transformado de const para let para poder ser alterado
let enemySpawnInterval = 2000; // ms for normal enemies
const MIN_SPAWN_INTERVAL = 500; // Valor mínimo para o intervalo de spawn
let enemyStrengthTimer = 0;
const enemyStrengthInterval = 20000; // Inimigos mais fortes a cada 20 segundos

// CORES AJUSTADAS
const TILE_COLOR_1 = '#555555';
const TILE_COLOR_2 = '#6b6b6b';

let enemyBaseStats = {
    hp: 10,
    damage: 5,
    rangedDamage: 7,
    colorLevel: 0,
    xpBonus: 0
};
const ENEMY_COLORS = ['#B22222', '#DAA520', '#c93466', '#289bb8', '#4B0082'];
const BOSS_COLOR_MELEE = '#8B0000';
const BOSS_COLOR_RANGED = '#00008B';

const BASE_XP_DROP = 2;
const TILE_SIZE = 50;

const PLAYER_MAX_ATTACK_RANGE = 10 * TILE_SIZE;
const ENEMY_RANGED_MAX_ATTACK_RANGE = 7 * TILE_SIZE;
const ENEMY_RANGED_PREFERRED_DISTANCE = 5 * TILE_SIZE;
const ENEMY_RANGED_DISTANCE_BUFFER = 1 * TILE_SIZE;

const BOSS_RANGED_PREFERRED_DISTANCE = 5 * TILE_SIZE;
const BOSS_RANGED_MAX_ATTACK_RANGE = 10 * TILE_SIZE;
const BOSS_RANGED_ATTACK_INTERVAL = 1.5; // s
const BOSS_RANGED_BURST_COOLDOWN = 5; // s
const BOSS_RANGED_BURST_PROJECTILES = 20;
const BOSS_MELEE_DASH_DISTANCE = 10 * TILE_SIZE;

// --- Player Object ---
function createPlayer() {
    return {
        x: camera.width / 2, y: camera.height / 2,
        radius: 15, color: '#008B8B',
        speed: 200, hp: 100, maxHp: 100, damage: 5,
        attackSpeed: 1.2, attackCooldown: 0,
        hpRegenRate: 2, hpRegenInterval: 3, hpRegenTimer: 0,
        isInvincible: false, invincibleTimer: 0, invincibleDuration: 0.2,
        xp: 0, level: 1, xpToNextLevel: 10,
        pickupRadius: 1.5 * TILE_SIZE,
        projectilesPerShot: 1, projectilePenetration: 1,
        upgrades: { enemyDeathExplosion: false },

        update: function (dt) {
            let moveX = 0, moveY = 0;
            if (keysPressed['w'] || keysPressed['arrowup']) moveY -= 1;
            if (keysPressed['s'] || keysPressed['arrowdown']) moveY += 1;
            if (keysPressed['a'] || keysPressed['arrowleft']) moveX -= 1;
            if (keysPressed['d'] || keysPressed['arrowright']) moveX += 1;

            if (moveX !== 0 || moveY !== 0) {
                const magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
                this.x += (moveX / magnitude) * this.speed * dt;
                this.y += (moveY / magnitude) * this.speed * dt;
            }
            this.attackCooldown -= dt;
            if (this.attackCooldown <= 0) { this.shoot(); this.attackCooldown = this.attackSpeed; }
            this.hpRegenTimer += dt;
            if (this.hpRegenTimer >= this.hpRegenInterval) { this.hp = Math.min(this.maxHp, this.hp + this.hpRegenRate); this.hpRegenTimer = 0; }
            if (this.isInvincible) { this.invincibleTimer -= dt; if (this.invincibleTimer <= 0) this.isInvincible = false; }
            this.collectXPOrbs();
        },
        draw: function () {
            ctx.fillStyle = this.isInvincible ? 'rgba(0, 255, 255, 0.5)' : this.color;
            ctx.beginPath(); ctx.arc(this.x - camera.x, this.y - camera.y, this.radius, 0, Math.PI * 2); ctx.fill();
        },
        shoot: function () {
            const nearestEnemy = findNearestEnemy(this.x, this.y, PLAYER_MAX_ATTACK_RANGE);
            if (nearestEnemy) {
                for (let i = 0; i < this.projectilesPerShot; i++) {
                    setTimeout(() => {
                        const angle = Math.atan2(nearestEnemy.y - this.y, nearestEnemy.x - this.x);
                        const spreadAngle = (this.projectilesPerShot > 1 && i > 0) ? (Math.random() - 0.5) * 0.3 : 0;
                        createProjectile(this.x, this.y, angle + spreadAngle, this.damage, this.projectilePenetration, 'player');
                    }, i * 60);
                }
            }
        },
        takeDamage: function (amount) {
            if (this.isInvincible) return; this.hp -= amount; this.isInvincible = true;
            this.invincibleTimer = this.invincibleDuration; if (this.hp <= 0) { this.hp = 0; gameOver(); }
        },
        addXP: function (amount) { if (gameState === 'gameOver') return; this.xp += amount; if (this.xp >= this.xpToNextLevel) this.levelUp(); },
        levelUp: function () {
            this.level++;
            this.xp -= this.xpToNextLevel; this.xpToNextLevel = Math.floor(10 * Math.pow(1.3, this.level - 1));
            gameState = 'levelUp'; showLevelUpOptions();
        },
        collectXPOrbs: function () {
            for (let i = xpOrbs.length - 1; i >= 0; i--) {
                const orb = xpOrbs[i]; const dist = Math.hypot(this.x - orb.x, this.y - orb.y);
                if (dist < this.pickupRadius + orb.radius) { this.addXP(orb.value); xpOrbs.splice(i, 1); }
                else if (dist < this.pickupRadius * 2.5) {
                    const angle = Math.atan2(this.y - orb.y, this.x - orb.x);
                    orb.x += Math.cos(angle) * (4 * TILE_SIZE) * deltaTime; orb.y += Math.sin(angle) * (4 * TILE_SIZE) * deltaTime;
                }
            }
        }
    };
}

// --- Enemy Object ---
function createEnemy(type = 'melee', isBoss = false, bossTypeIfBoss = null) {
    // MODIFICADO: Nova lógica de spawn ao redor do jogador
    let spawnX, spawnY;
    // Calcula um raio de spawn um pouco maior que a diagonal da tela para garantir que o inimigo apareça fora da visão
    const spawnRadius = Math.hypot(camera.width / 2, camera.height / 2) + TILE_SIZE * 2;
    const randomAngle = Math.random() * 2 * Math.PI;

    // Define a posição de spawn em um círculo ao redor do jogador
    spawnX = player.x + Math.cos(randomAngle) * spawnRadius;
    spawnY = player.y + Math.sin(randomAngle) * spawnRadius;

    let enemyHp = enemyBaseStats.hp;
    let enemyDamage = type === 'melee' ? enemyBaseStats.damage : enemyBaseStats.rangedDamage;
    let xpDropValue = BASE_XP_DROP + enemyBaseStats.xpBonus;
    let radius = type === 'melee' ? 0.24 * TILE_SIZE : 0.2 * TILE_SIZE;
    let speed = (type === 'melee' ? 1.6 : 1.4) * TILE_SIZE + Math.random() * (0.8 * TILE_SIZE);
    let color = ENEMY_COLORS[enemyBaseStats.colorLevel % ENEMY_COLORS.length];
    let rangedAttackIntervalValue = 2.5 + Math.random();

    if (isBoss) {
        enemyHp *= 10;
        enemyDamage *= 5;
        xpDropValue *= 10;
        radius *= 3;
        color = bossTypeIfBoss === 'melee' ? BOSS_COLOR_MELEE : BOSS_COLOR_RANGED;
        speed *= (bossTypeIfBoss === 'melee' ? 0.9 : 0.7);
    }

    const enemy = {
        x: spawnX, y: spawnY, radius: radius, color: color, speed: speed,
        hp: enemyHp, maxHp: enemyHp, damage: enemyDamage, xpDrop: xpDropValue,
        type: type, isBoss: isBoss, bossType: bossTypeIfBoss,

        isDashing: false, dashAngle: 0, dashTimer: Math.random() * 3,
        dashDurationTimer: 0, dashDuration: 0.3,
        postDashPause: 1, postDashTimer: 0, dashCooldown: 3,

        rangedAttackTimer: 0, rangedAttackInterval: rangedAttackIntervalValue,
        burstAttackTimer: Math.random() * BOSS_RANGED_BURST_COOLDOWN,

        update: function (dt) {
            if (this.isBoss && this.bossType === 'melee') this.updateBossMelee(dt);
            else if (this.isBoss && this.bossType === 'ranged') this.updateBossRanged(dt);
            else this.updateNormalEnemy(dt);
        },
        updateNormalEnemy: function (dt) {
            const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
            let moveX = Math.cos(angleToPlayer);
            let moveY = Math.sin(angleToPlayer);
            let intendedSpeed = this.speed;

            if (this.type === 'ranged') {
                const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);

                // MODIFICADO: Lógica de perseguição constante para inimigos a distância
                if (distToPlayer < ENEMY_RANGED_PREFERRED_DISTANCE - ENEMY_RANGED_DISTANCE_BUFFER) {
                    // Muito perto, afasta-se
                    moveX *= -1;
                    moveY *= -1;
                } else if (distToPlayer > ENEMY_RANGED_PREFERRED_DISTANCE + ENEMY_RANGED_DISTANCE_BUFFER) {
                    // Muito longe, aproxima-se (esta condição já era a padrão, mas explicitamos)
                    // Não faz nada, pois moveX e moveY já estão corretos
                } else {
                    // Na distância ideal, para de se mover para atirar
                    intendedSpeed = 0;
                }

                this.rangedAttackTimer -= dt;
                // Ataca se estiver parado (na distância ideal) e o cooldown tiver acabado
                if (intendedSpeed === 0 && this.rangedAttackTimer <= 0 && distToPlayer <= ENEMY_RANGED_MAX_ATTACK_RANGE) {
                    createProjectile(this.x, this.y, angleToPlayer, this.damage, 1, 'enemy');
                    this.rangedAttackTimer = this.rangedAttackInterval;
                }
            }

            // Aplica o movimento
            this.x += moveX * intendedSpeed * dt;
            this.y += moveY * intendedSpeed * dt;
        },
        updateBossMelee: function (dt) {
            if (this.postDashTimer > 0) { this.postDashTimer -= dt; if (this.postDashTimer <= 0) this.isDashing = false; return; }
            if (this.isDashing) {
                const dashActualSpeed = BOSS_MELEE_DASH_DISTANCE / this.dashDuration;
                this.x += Math.cos(this.dashAngle) * dashActualSpeed * dt;
                this.y += Math.sin(this.dashAngle) * dashActualSpeed * dt;
                this.dashDurationTimer -= dt;
                if (this.dashDurationTimer <= 0) { this.isDashing = false; this.postDashTimer = this.postDashPause; this.dashTimer = this.dashCooldown; }
                return;
            }
            this.dashTimer -= dt;
            if (this.dashTimer <= 0) { this.isDashing = true; this.dashAngle = Math.atan2(player.y - this.y, player.x - this.x); this.dashDurationTimer = this.dashDuration; return; }
            const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
            this.x += Math.cos(angleToPlayer) * this.speed * dt; this.y += Math.sin(angleToPlayer) * this.speed * dt;
        },
        updateBossRanged: function (dt) {
            const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
            const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
            let moveX = Math.cos(angleToPlayer), moveY = Math.sin(angleToPlayer), intendedSpeed = this.speed;
            if (distToPlayer < BOSS_RANGED_PREFERRED_DISTANCE - ENEMY_RANGED_DISTANCE_BUFFER) { moveX *= -1; moveY *= -1; }
            else if (distToPlayer > BOSS_RANGED_PREFERRED_DISTANCE + ENEMY_RANGED_DISTANCE_BUFFER && distToPlayer < BOSS_RANGED_MAX_ATTACK_RANGE * 1.2) {}
            else { intendedSpeed = 0; }
            this.x += moveX * intendedSpeed * dt; this.y += moveY * intendedSpeed * dt;
            this.rangedAttackTimer -= dt;
            if (this.rangedAttackTimer <= 0 && distToPlayer <= BOSS_RANGED_MAX_ATTACK_RANGE) {
                const coneSpread = Math.PI / 12;
                for (let i = -1; i <= 1; i++) createProjectile(this.x, this.y, angleToPlayer + (i * coneSpread), this.damage, 1, 'enemy', true);
                this.rangedAttackTimer = BOSS_RANGED_ATTACK_INTERVAL;
            }
            this.burstAttackTimer -= dt;
            if (this.burstAttackTimer <= 0 && distToPlayer <= BOSS_RANGED_MAX_ATTACK_RANGE * 1.1) {
                for (let i = 0; i < BOSS_RANGED_BURST_PROJECTILES; i++) {
                    setTimeout(() => {
                        if (!this.hp || this.hp <= 0) return;
                        const currentAngleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
                        createProjectile(this.x, this.y, currentAngleToPlayer, Math.floor(this.damage * 0.7), 1, 'enemy', true);
                    }, i * 50);
                }
                this.burstAttackTimer = BOSS_RANGED_BURST_COOLDOWN;
            }
        },
        draw: function () {
            ctx.fillStyle = this.color; const screenX = this.x - camera.x; const screenY = this.y - camera.y; const drawRadius = this.radius;
            if (this.isBoss) {
                ctx.beginPath(); ctx.arc(screenX, screenY, drawRadius, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; ctx.lineWidth = 4; ctx.stroke();
            } else if (this.type === 'melee') ctx.fillRect(screenX - drawRadius, screenY - drawRadius, drawRadius * 2, drawRadius * 2);
            else {
                ctx.beginPath(); ctx.moveTo(screenX, screenY - drawRadius * 1.2);
                ctx.lineTo(screenX - drawRadius, screenY + drawRadius * 0.8); ctx.lineTo(screenX + drawRadius, screenY + drawRadius * 0.8);
                ctx.closePath(); ctx.fill();
            }
            if (this.hp < this.maxHp) {
                const barW = drawRadius * (this.isBoss ? 1.5 : 2); const barH = this.isBoss ? 8 : 5; const barYOff = drawRadius + (this.isBoss ? 10 : 8);
                ctx.fillStyle = '#333'; ctx.fillRect(screenX - barW / 2, screenY - barYOff, barW, barH);
                ctx.fillStyle = this.isBoss ? '#FF0000' : '#8B0000'; ctx.fillRect(screenX - barW / 2, screenY - barYOff, barW * (this.hp / this.maxHp), barH);
            }
        },
        takeDamage: function (amount) { this.hp -= amount; if (this.hp <= 0) this.die(); },
        die: function () {
            createXPOrb(this.x, this.y, this.xpDrop); score++;
            if (this.isBoss) { bossActive = false; /* bossSpawnedForCurrentBossWave é resetado em scaleEnemies */ }
            if (player.upgrades.enemyDeathExplosion) {
                const dirs = [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2];
                dirs.forEach(a => createProjectile(this.x, this.y, a, Math.max(1, Math.floor(this.damage / 2)), 1, 'enemy_explosion'));
            }
            enemies = enemies.filter(e => e !== this);
        }
    };
    if (isBoss) { bossActive = true; bossSpawnedForCurrentBossWave = true; }
    enemies.push(enemy);
}

// --- Projectile Object ---
function createProjectile(x, y, angle, damage, penetration, owner, isBossProjectile = false) {
    let pColor = '#c92e2e', pRadius = 0.1 * TILE_SIZE, pSpeed = 9 * TILE_SIZE;
    if (owner === 'enemy') {
        pColor = isBossProjectile ? '#FF6347' : '#CD5C5C'; pRadius = (isBossProjectile ? 0.2 : 0.12) * TILE_SIZE; pSpeed = (isBossProjectile ? 7 : 6) * TILE_SIZE;
    } else if (owner === 'enemy_explosion') { pColor = '#d2b41e'; pRadius = 0.11 * TILE_SIZE; pSpeed = 5 * TILE_SIZE; }
    projectiles.push({
        x: x, y: y, radius: pRadius, color: pColor, speed: pSpeed, dx: Math.cos(angle), dy: Math.sin(angle),
        damage: damage, penetrationLeft: penetration, owner: owner, hitTargets: [],
        lifeTime: owner === 'player' ? (PLAYER_MAX_ATTACK_RANGE / (pSpeed * 0.95)) : (ENEMY_RANGED_MAX_ATTACK_RANGE / (pSpeed * 0.95)),
        update: function (dt) { this.x += this.dx * this.speed * dt; this.y += this.dy * this.speed * dt; this.lifeTime -= dt; },
        draw: function () {
            ctx.fillStyle = this.color; ctx.beginPath();
            if (this.owner === 'enemy' || this.owner === 'enemy_explosion') {
                ctx.strokeStyle = 'black'; ctx.lineWidth = 1; ctx.arc(this.x - camera.x, this.y - camera.y, this.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            } else { ctx.arc(this.x - camera.x, this.y - camera.y, this.radius, 0, Math.PI * 2); ctx.fill(); }
        }
    });
}

// --- XP Orb Object ---
function createXPOrb(x, y, value) {
    xpOrbs.push({
        x: x, y: y, radius: 0.12 * TILE_SIZE, color: '#8A2BE2', value: value,
        draw: function () { ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x - camera.x, this.y - camera.y, this.radius, 0, Math.PI * 2); ctx.fill(); }
    });
}

// --- Game Logic Functions ---
function findNearestEnemy(x, y, maxRange = Infinity) {
    let nearest = null, nearestDist = maxRange;
    enemies.forEach(enemy => { const dist = Math.hypot(enemy.x - x, enemy.y - y); if (dist < nearestDist) { nearest = enemy; nearestDist = dist; } });
    return nearest;
}
function checkCollisions() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i]; if (!p || p.lifeTime <= 0) { if (p) projectiles.splice(i, 1); continue; }
        let pRemoved = false;
        if (p.owner === 'player') {
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j]; if (!e || p.hitTargets.includes(e)) continue;
                if (Math.hypot(p.x - e.x, p.y - e.y) < p.radius + e.radius) {
                    e.takeDamage(p.damage); p.hitTargets.push(e); p.penetrationLeft--;
                    if (p.penetrationLeft <= 0) { projectiles.splice(i, 1); pRemoved = true; break; }
                }
            }
        } else if (p.owner === 'enemy') {
            if (Math.hypot(p.x - player.x, p.y - player.y) < p.radius + player.radius) {
                if (!player.isInvincible) player.takeDamage(p.damage); projectiles.splice(i, 1); pRemoved = true;
            }
        } else if (p.owner === 'enemy_explosion') {
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j]; if (!e || p.hitTargets.includes(e)) continue;
                if (Math.hypot(p.x - e.x, p.y - e.y) < p.radius + e.radius) {
                    e.takeDamage(p.damage); p.hitTargets.push(e); p.penetrationLeft--;
                    if (p.penetrationLeft <= 0) { projectiles.splice(i, 1); pRemoved = true; break; }
                }
            }
        }
        if (!pRemoved && (p.x < camera.x - 2 * TILE_SIZE || p.x > camera.x + camera.width + 2 * TILE_SIZE || p.y < camera.y - 2 * TILE_SIZE || p.y > camera.y + camera.height + 2 * TILE_SIZE)) {
            if (projectiles[i] === p) projectiles.splice(i, 1);
        }
    }
    if (!player.isInvincible) {
        enemies.forEach(e => {
            if (!e) return;
            if (Math.hypot(player.x - e.x, player.y - e.y) < player.radius + e.radius) {
                if (e.type === 'melee' || (e.type === 'ranged' && Math.hypot(player.x - e.x, player.y - e.y) < player.radius + e.radius - (0.1 * TILE_SIZE))) {
                    player.takeDamage(e.damage);
                }
            }
        });
    }
}
function resolveEnemyCollisions() {
    const iterations = 2;
    for (let iter = 0; iter < iterations; iter++) {
        for (let i = 0; i < enemies.length; i++) {
            for (let j = i + 1; j < enemies.length; j++) {
                const e1 = enemies[i], e2 = enemies[j]; const dist = Math.hypot(e1.x - e2.x, e1.y - e2.y);
                const minAllowedDist = (e1.radius + e2.radius) * 0.9;
                if (dist < minAllowedDist && dist > 0.001) {
                    const overlap = (minAllowedDist - dist); const angle = Math.atan2(e1.y - e2.y, e1.x - e2.x);
                    const pushX = Math.cos(angle) * overlap * 0.5, pushY = Math.sin(angle) * overlap * 0.5;
                    e1.x += pushX; e1.y += pushY; e2.x -= pushX; e2.y -= pushY;
                }
            }
        }
    }
}
function updateUI() {
    hpBar.style.width = (player.hp / player.maxHp) * 100 + '%'; hpText.textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
    xpBar.style.width = (player.xp / player.xpToNextLevel) * 100 + '%'; xpText.textContent = `${player.xp}/${player.xpToNextLevel}`;
    levelText.textContent = `Nível: ${player.level}`; timerText.textContent = `Tempo: ${Math.floor(gameTime / 1000)}s`; scoreText.textContent = `Abates: ${score}`;
    if (gameState === 'paused') {
        ctx.save(); ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "white"; ctx.font = "48px Arial"; ctx.textAlign = "center"; ctx.fillText("PAUSADO", canvas.width / 2, canvas.height / 2);
        ctx.font = "24px Arial"; ctx.fillText("Pressione ESPAÇO para continuar", canvas.width / 2, canvas.height / 2 + 50); ctx.restore();
    }
}

function spawnEnemies() {
    if (strengthWaveCount > 0 && strengthWaveCount % 5 === 0 && !bossSpawnedForCurrentBossWave && !bossActive) {
        const bossType = Math.random() < 0.5 ? 'melee' : 'ranged';
        console.log(`Spawning ${bossType.toUpperCase()} BOSS for strength wave ${strengthWaveCount}! (Time: ${Math.floor(gameTime/1000)}s)`);
        createEnemy(bossType, true, bossType);
        enemySpawnTimer = -3000;
        return;
    }
    if (bossActive) return;

    if (enemySpawnTimer >= enemySpawnInterval) {
        const baseSpawnCount = 1 + Math.floor(gameTime / 20000);
        const spawnCountVariance = Math.floor(baseSpawnCount * 0.5);
        const numToSpawn = baseSpawnCount + Math.floor(Math.random() * (spawnCountVariance * 2 + 1)) - spawnCountVariance;
        for (let i = 0; i < Math.max(1, numToSpawn); i++) createEnemy(Math.random() < 0.35 ? 'ranged' : 'melee');
        enemySpawnTimer = 0;
    }
}

function scaleEnemies() {
    if (enemyStrengthTimer >= enemyStrengthInterval) {
        strengthWaveCount++;
        enemyBaseStats.hp = Math.floor(enemyBaseStats.hp * 1.12);
        enemyBaseStats.damage = Math.floor(enemyBaseStats.damage * 1.1);
        enemyBaseStats.rangedDamage = Math.floor(enemyBaseStats.rangedDamage * 1.1);
        enemyBaseStats.colorLevel++;
        enemyBaseStats.xpBonus += 1;
        enemyStrengthTimer = 0;

        // MODIFICADO: Reduz o intervalo de spawn a cada onda de fortalecimento
        if (enemySpawnInterval > MIN_SPAWN_INTERVAL) {
            enemySpawnInterval -= 50; // Reduz em 0.05s
        }

        console.log(`Enemies stronger! Wave: ${strengthWaveCount}, HP: ${enemyBaseStats.hp}, New Spawn Interval: ${enemySpawnInterval}ms`);

        if (strengthWaveCount % 5 === 0) {
            bossSpawnedForCurrentBossWave = false;
        }
    }
}

// --- Upgrade System ---
const allUpgrades = [
    { name: "+10% Dano", apply: (p) => p.damage = parseFloat((p.damage * 1.1).toFixed(2)) },
    { name: "+5% Vel. Movimento", apply: (p) => p.speed *= 1.05 },
    { name: "+10% Vel. Ataque", apply: (p) => p.attackSpeed = parseFloat((p.attackSpeed * 0.9).toFixed(3)) },
    { name: "+2 Regeneração de Vida/3s", apply: (p) => p.hpRegenRate += 2 },
    { name: "+10% Vida Máxima", apply: (p) => { const i = Math.floor(p.maxHp * 0.1); p.maxHp += Math.max(10, i); p.hp = Math.min(p.hp + Math.max(10, i), p.maxHp); } },
    { name: "+1 Penetração de Tiro", apply: (p) => p.projectilePenetration += 1 },
    { name: "+1 Tiro Extra", apply: (p) => p.projectilesPerShot += 1 },
    { name: "Explosão ao Abater Inimigo", apply: (p) => p.upgrades.enemyDeathExplosion = true, unique: true, description: "Inimigos explodem ao morrer, causando dano a OUTROS INIMIGOS." },
    { name: "+20% Alcance de Coleta XP", apply: (p) => p.pickupRadius *= 1.2 },
    { name: "Cura Total (Anjo)", apply: (p) => { p.hp = p.maxHp; }, unique: true, description: "Restaura toda a sua vida instantaneamente." }
];
let playerChosenUniqueUpgrades = new Set();
function showLevelUpOptions() {
    levelUpScreen.classList.remove('hidden'); upgradeOptionsContainer.innerHTML = '';
    let availableUpgrades = [...allUpgrades].filter(upg => !(upg.unique && playerChosenUniqueUpgrades.has(upg.name)));
    for (let i = availableUpgrades.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[availableUpgrades[i], availableUpgrades[j]] = [availableUpgrades[j], availableUpgrades[i]]; }
    const optionsToShow = Math.min(3, availableUpgrades.length);
    for (let i = 0; i < optionsToShow; i++) {
        const upgrade = availableUpgrades[i]; const button = document.createElement('button'); button.textContent = upgrade.name;
        if (upgrade.description) button.title = upgrade.description;
        button.onclick = () => selectUpgrade(upgrade); upgradeOptionsContainer.appendChild(button);
    }
}
function selectUpgrade(upgrade) {
    upgrade.apply(player); if (upgrade.unique) playerChosenUniqueUpgrades.add(upgrade.name);
    levelUpScreen.classList.add('hidden'); gameState = 'playing'; lastTime = performance.now(); requestAnimationFrame(gameLoop);
}

// --- Background Drawing ---
function drawBackground() {
    let startCol = Math.floor(camera.x / TILE_SIZE), endCol = Math.ceil((camera.x + camera.width) / TILE_SIZE);
    let startRow = Math.floor(camera.y / TILE_SIZE), endRow = Math.ceil((camera.y + camera.height) / TILE_SIZE);
    for (let r = startRow; r < endRow; r++) {
        for (let c = startCol; c < endCol; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? TILE_COLOR_1 : TILE_COLOR_2;
            ctx.fillRect(c * TILE_SIZE - camera.x, r * TILE_SIZE - camera.y, TILE_SIZE, TILE_SIZE);
        }
    }
}

// --- Game State Functions ---
function resizeCanvas() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    camera.width = canvas.width; camera.height = canvas.height; if (player) camera.update();
}
function initGame() {
    resizeCanvas(); player = createPlayer(); camera.update();
    bossActive = false; bossSpawnedForCurrentBossWave = false; strengthWaveCount = 0; // Resetar contadores de boss
    enemies = []; projectiles = []; xpOrbs = []; gameTime = 0; score = 0;
    enemySpawnTimer = 0; enemyStrengthTimer = 0;
    enemySpawnInterval = 2000; // MODIFICADO: Reseta o intervalo de spawn ao iniciar o jogo
    enemyBaseStats = { hp: 10, damage: 5, rangedDamage: 7, colorLevel: 0, xpBonus: 0 };
    playerChosenUniqueUpgrades.clear(); gameState = 'playing';
    levelUpScreen.classList.add('hidden'); gameOverScreen.classList.add('hidden'); updateUI();
}
function gameOver() {
    gameState = 'gameOver'; finalTimeText.textContent = `${Math.floor(gameTime / 1000)}s`;
    finalScoreText.textContent = score; finalLevelText.textContent = player.level;
    gameOverScreen.classList.remove('hidden');
}
function restartGame() { initGame(); lastTime = performance.now(); requestAnimationFrame(gameLoop); }
function togglePause() {
    if (gameState === 'playing') gameState = 'paused';
    else if (gameState === 'paused') { gameState = 'playing'; lastTime = performance.now(); requestAnimationFrame(gameLoop); }
}

// --- Main Game Loop ---
function gameLoop(currentTime) {
    if (gameState === 'gameOver' || gameState === 'levelUp' || gameState === 'paused') {
        if (gameState === 'paused') { updateUI(); requestAnimationFrame(gameLoop); }
        else if (gameState === 'levelUp') {
            ctx.clearRect(0, 0, canvas.width, canvas.height); drawBackground();
            xpOrbs.forEach(orb => orb.draw()); enemies.forEach(e => e.draw());
            player.draw(); projectiles.forEach(p => p.draw()); updateUI();
        }
        return;
    }
    deltaTime = (currentTime - lastTime) / 1000; lastTime = currentTime;
    const MAX_DELTA_TIME = 0.1; if (deltaTime > MAX_DELTA_TIME) deltaTime = MAX_DELTA_TIME;
    gameTime += deltaTime * 1000;
    enemySpawnTimer += deltaTime * 1000; enemyStrengthTimer += deltaTime * 1000;

    player.update(deltaTime); camera.update();
    enemies.forEach(e => e.update(deltaTime));
    resolveEnemyCollisions(); projectiles.forEach(p => p.update(deltaTime));
    spawnEnemies(); scaleEnemies(); checkCollisions();

    ctx.clearRect(0, 0, canvas.width, canvas.height); drawBackground();
    xpOrbs.forEach(orb => orb.draw()); enemies.forEach(e => e.draw());
    player.draw(); projectiles.forEach(p => p.draw()); updateUI();
    requestAnimationFrame(gameLoop);
}

// --- Event Listeners ---
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase(); keysPressed[key] = true;
    if (key === ' ') { e.preventDefault(); togglePause(); }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
});
window.addEventListener('keyup', (e) => { keysPressed[e.key.toLowerCase()] = false; });
window.addEventListener('resize', resizeCanvas);

// --- Start Game ---
initGame();
lastTime = performance.now();
requestAnimationFrame(gameLoop);
