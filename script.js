const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements (mesmos da resposta anterior)
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
let enemies = []; // Agora pode conter inimigos normais e chefões
let projectiles = [];
let xpOrbs = [];
let bossActive = false;

let camera = {
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
    update: function () {
        if (player) {
            this.x = player.x - this.width / 2;
            this.y = player.y - this.height / 2;
        }
    }
};

const keysPressed = {};
let gameTime = 0;
let gameState = 'playing'; // 'playing', 'levelUp', 'gameOver', 'paused'
let lastTime = 0;
let deltaTime = 0;
let score = 0;

let enemySpawnTimer = 0;
const enemySpawnInterval = 2000;
let enemyStrengthTimer = 0;
const enemyStrengthInterval = 30000;
let enemyBaseStats = {
    hp: 10,
    damage: 5,
    rangedDamage: 7,
    colorLevel: 0,
    xpBonus: 0
};
const ENEMY_COLORS = ['#B22222', '#DAA520', '#c93466', '#289bb8', '#4B0082'];
const BOSS_COLOR_MELEE = '#8B0000'; // DarkRed
const BOSS_COLOR_RANGED = '#00008B'; // DarkBlue

const BASE_XP_DROP = 2;
const TILE_SIZE = 50;

const PLAYER_MAX_ATTACK_RANGE = 10 * TILE_SIZE;
const ENEMY_RANGED_MAX_ATTACK_RANGE = 7 * TILE_SIZE;
const ENEMY_RANGED_PREFERRED_DISTANCE = 5 * TILE_SIZE;
const ENEMY_RANGED_DISTANCE_BUFFER = 1 * TILE_SIZE;

const BOSS_RANGED_PREFERRED_DISTANCE = 5 * TILE_SIZE; // (igual ao pedido)
const BOSS_RANGED_MAX_ATTACK_RANGE = 10 * TILE_SIZE; // (igual ao pedido)
const BOSS_RANGED_ATTACK_INTERVAL = 1.5; //s
const BOSS_RANGED_BURST_COOLDOWN = 5; //s
const BOSS_RANGED_BURST_PROJECTILES = 20;

// --- Player Object ---
function createPlayer() {
    return {
        x: camera.width / 2,
        y: camera.height / 2,
        radius: 15,
        color: '#008B8B', // DarkCyan
        levelsSinceLastBoss: 0,
        speed: 200, // pixels per second (4 * TILE_SIZE)
        hp: 100,
        maxHp: 100,
        damage: 5,
        attackSpeed: 1.2,
        attackCooldown: 0,
        hpRegenRate: 2,
        hpRegenInterval: 3,
        hpRegenTimer: 0,
        isInvincible: false,
        invincibleTimer: 0,
        invincibleDuration: 0.2,
        xp: 0,
        level: 1,
        xpToNextLevel: 10,
        pickupRadius: 1.5 * TILE_SIZE, // Ajustado para TILE_SIZE
        projectilesPerShot: 1,
        projectilePenetration: 1,
        upgrades: {
            enemyDeathExplosion: false
        },

        update: function (dt) {
            // Movement
            let moveX = 0;
            let moveY = 0;
            if (keysPressed['w'] || keysPressed['arrowup']) moveY -= 1;
            if (keysPressed['s'] || keysPressed['arrowdown']) moveY += 1;
            if (keysPressed['a'] || keysPressed['arrowleft']) moveX -= 1;
            if (keysPressed['d'] || keysPressed['arrowright']) moveX += 1;

            if (moveX !== 0 || moveY !== 0) {
                const magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
                this.x += (moveX / magnitude) * this.speed * dt;
                this.y += (moveY / magnitude) * this.speed * dt;
            }

            // Attack
            this.attackCooldown -= dt;
            if (this.attackCooldown <= 0) {
                this.shoot();
                this.attackCooldown = this.attackSpeed;
            }

            // HP Regen
            this.hpRegenTimer += dt;
            if (this.hpRegenTimer >= this.hpRegenInterval) {
                this.hp = Math.min(this.maxHp, this.hp + this.hpRegenRate);
                this.hpRegenTimer = 0;
            }

            // Invincibility
            if (this.isInvincible) {
                this.invincibleTimer -= dt;
                if (this.invincibleTimer <= 0) {
                    this.isInvincible = false;
                }
            }
            this.collectXPOrbs();
        },

        draw: function () {
            ctx.fillStyle = this.isInvincible ? 'rgba(0, 255, 255, 0.5)' : this.color;
            ctx.beginPath();
            ctx.arc(this.x - camera.x, this.y - camera.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        },

        shoot: function () {
            const nearestEnemy = findNearestEnemy(this.x, this.y, PLAYER_MAX_ATTACK_RANGE); // Passa o range
            if (nearestEnemy) {
                for (let i = 0; i < this.projectilesPerShot; i++) {
                    setTimeout(() => {
                        const angle = Math.atan2(nearestEnemy.y - this.y, nearestEnemy.x - this.x);
                        const spreadAngle = (this.projectilesPerShot > 1 && i > 0) ? (Math.random() - 0.5) * 0.3 : 0;
                        createProjectile(
                            this.x, this.y,
                            angle + spreadAngle,
                            this.damage,
                            this.projectilePenetration,
                            'player'
                        );
                    }, i * 60);
                }
            }
        },

        takeDamage: function (amount) {
            if (this.isInvincible) return;
            this.hp -= amount;
            this.isInvincible = true;
            this.invincibleTimer = this.invincibleDuration;
            if (this.hp <= 0) {
                this.hp = 0;
                gameOver();
            }
        },

        addXP: function (amount) {
            if (gameState === 'gameOver') return;
            this.xp += amount;
            if (this.xp >= this.xpToNextLevel) {
                this.levelUp();
            }
        },

        levelUp: function () {
            this.level++;
            this.levelsSinceLastBoss++; // Incrementar aqui
            this.xp -= this.xpToNextLevel;
            this.xpToNextLevel = Math.floor(10 * Math.pow(1.3, this.level - 1));
            gameState = 'levelUp';
            showLevelUpOptions();
        },

        collectXPOrbs: function () {
            for (let i = xpOrbs.length - 1; i >= 0; i--) {
                const orb = xpOrbs[i];
                const dist = Math.hypot(this.x - orb.x, this.y - orb.y);
                // pickupRadius já é baseado em TILE_SIZE
                if (dist < this.pickupRadius + orb.radius) {
                    this.addXP(orb.value);
                    xpOrbs.splice(i, 1);
                } else if (dist < this.pickupRadius * 2.5) { // Magnet effect
                    const angle = Math.atan2(this.y - orb.y, this.x - orb.x);
                    orb.x += Math.cos(angle) * (4 * TILE_SIZE) * deltaTime; // Magnet speed
                    orb.y += Math.sin(angle) * (4 * TILE_SIZE) * deltaTime;
                }
            }
        }
    };
}

// --- Enemy Object ---
function createEnemy(type = 'melee', isBoss = false, bossType = null) {
    const spawnMargin = (isBoss ? 4 : 2) * TILE_SIZE; // Boss spawna um pouco mais longe
    let spawnX, spawnY;
    const side = Math.floor(Math.random() * 4);

    switch (side) {
        case 0:
            spawnX = Math.random() * camera.width + camera.x;
            spawnY = camera.y - spawnMargin;
            break;
        case 1:
            spawnX = camera.x + camera.width + spawnMargin;
            spawnY = Math.random() * camera.height + camera.y;
            break;
        case 2:
            spawnX = Math.random() * camera.width + camera.x;
            spawnY = camera.y + camera.height + spawnMargin;
            break;
        case 3:
            spawnX = camera.x - spawnMargin;
            spawnY = Math.random() * camera.height + camera.y;
            break;
    }

    let currentEnemyHp = enemyBaseStats.hp;
    let currentEnemyDamage = type === 'melee' ? enemyBaseStats.damage : enemyBaseStats.rangedDamage;
    let currentXpDrop = BASE_XP_DROP + enemyBaseStats.xpBonus;
    let enemyRadius = type === 'melee' ? 0.24 * TILE_SIZE : 0.2 * TILE_SIZE;
    let enemySpeed = (type === 'melee' ? 1.6 : 1.4) * TILE_SIZE + Math.random() * (0.8 * TILE_SIZE);
    let enemyColor = ENEMY_COLORS[enemyBaseStats.colorLevel % ENEMY_COLORS.length];

    if (isBoss) {
        currentEnemyHp *= 5;
        currentEnemyDamage *= 5; // Dano base do boss. Ataques especiais podem ter multiplicadores.
        currentXpDrop *= 10;
        enemyRadius *= 3;
        enemyColor = bossType === 'melee' ? BOSS_COLOR_MELEE : BOSS_COLOR_RANGED;
        // Velocidade do boss pode ser diferente, ex: melee boss mais lento, ranged mais tático
        enemySpeed *= (bossType === 'melee' ? 0.8 : 0.6);
    }

    const enemy = {
        x: spawnX, y: spawnY,
        radius: enemyRadius,
        color: enemyColor,
        speed: enemySpeed,
        hp: currentEnemyHp,
        maxHp: currentEnemyHp,
        damage: currentEnemyDamage,
        type: type, // 'melee' ou 'ranged'
        isBoss: isBoss,
        bossType: bossType, // 'melee' ou 'ranged' se isBoss for true

        // Propriedades específicas do Boss Melee
        isDashing: false,
        dashCooldown: 3, //s
        dashTimer: Math.random() * 3, // Para não dar dash todos ao mesmo tempo se houver mais de 1
        dashDuration: 0.3, //s Quanto tempo o dash dura
        dashSpeedMultiplier: 4, // Quão mais rápido ele é durante o dash
        postDashPause: 1, //s Tempo parado após o dash
        postDashTimer: 0,

        // Propriedades específicas do Boss Ranged
        rangedAttackTimer: 0,
        burstAttackTimer: Math.random() * BOSS_RANGED_BURST_COOLDOWN, // Cooldown inicial aleatório

        update: function (dt) {
            if (this.isBoss && this.bossType === 'melee') {
                this.updateBossMelee(dt);
            } else if (this.isBoss && this.bossType === 'ranged') {
                this.updateBossRanged(dt);
            } else { // Inimigo Normal
                this.updateNormalEnemy(dt);
            }
        },

        updateNormalEnemy: function (dt) {
            // ... (lógica de update do inimigo normal como antes) ...
            const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
            let moveX = Math.cos(angleToPlayer);
            let moveY = Math.sin(angleToPlayer);
            let intendedSpeed = this.speed;

            if (this.type === 'ranged') {
                const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
                if (distToPlayer < ENEMY_RANGED_PREFERRED_DISTANCE - ENEMY_RANGED_DISTANCE_BUFFER) {
                    moveX *= -1; moveY *= -1;
                } else if (distToPlayer > ENEMY_RANGED_PREFERRED_DISTANCE + ENEMY_RANGED_DISTANCE_BUFFER && distToPlayer < ENEMY_RANGED_MAX_ATTACK_RANGE * 1.5) {
                    // Segue
                } else { intendedSpeed = 0; }

                this.rangedAttackTimer -= dt; // Usando rangedAttackTimer em vez de rangedAttackCooldown
                if (intendedSpeed === 0 && this.rangedAttackTimer <= 0 && distToPlayer <= ENEMY_RANGED_MAX_ATTACK_RANGE) {
                    createProjectile(this.x, this.y, angleToPlayer, this.damage, 1, 'enemy');
                    this.rangedAttackTimer = this.rangedAttackInterval || (2.5 + Math.random()); // Se não tiver, usa default
                }
            }
            this.x += moveX * intendedSpeed * dt;
            this.y += moveY * intendedSpeed * dt;
        },

        updateBossMelee: function (dt) {
            this.dashTimer -= dt;
            if (this.postDashTimer > 0) {
                this.postDashTimer -= dt;
                return; // Parado após o dash
            }

            if (this.isDashing) {
                // Continua o dash se a duração não acabou
                // (movimento do dash já aplicado quando iniciado)
                // A duração do dash é controlada pelo postDashTimer
                return;
            }

            if (this.dashTimer <= 0 && !this.isDashing) {
                // Inicia o Dash
                this.isDashing = true;
                const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
                const dashDistance = this.speed * this.dashSpeedMultiplier * this.dashDuration;
                this.x += Math.cos(angleToPlayer) * dashDistance;
                this.y += Math.sin(angleToPlayer) * dashDistance;

                // Configura timers pós-dash
                this.postDashTimer = this.dashDuration + this.postDashPause;
                this.dashTimer = this.dashCooldown; // Reseta cooldown do dash
                // isDashing será resetado quando postDashTimer < postDashPause
                setTimeout(() => { this.isDashing = false; }, this.dashDuration * 1000);
                return;
            }

            // Persegue normalmente se não estiver dando dash ou em cooldown de dash
            const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
            this.x += Math.cos(angleToPlayer) * this.speed * dt;
            this.y += Math.sin(angleToPlayer) * this.speed * dt;
        },

        updateBossRanged: function (dt) {
            const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
            const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
            let moveX = Math.cos(angleToPlayer);
            let moveY = Math.sin(angleToPlayer);
            let intendedSpeed = this.speed;

            // Lógica de posicionamento
            if (distToPlayer < BOSS_RANGED_PREFERRED_DISTANCE - ENEMY_RANGED_DISTANCE_BUFFER) {
                moveX *= -1; moveY *= -1; // Muito perto, afasta
            } else if (distToPlayer > BOSS_RANGED_PREFERRED_DISTANCE + ENEMY_RANGED_DISTANCE_BUFFER && distToPlayer < BOSS_RANGED_MAX_ATTACK_RANGE * 1.2) {
                // Longe, aproxima
            } else {
                intendedSpeed = 0; // Na distância ideal, para ou move-se lentamente
            }
            this.x += moveX * intendedSpeed * dt;
            this.y += moveY * intendedSpeed * dt;

            // Ataque Normal
            this.rangedAttackTimer -= dt;
            if (this.rangedAttackTimer <= 0 && distToPlayer <= BOSS_RANGED_MAX_ATTACK_RANGE) {
                // Atira 3 projéteis em cone
                const coneSpread = Math.PI / 12; // Ângulo do cone (ex: 15 graus para cada lado)
                for (let i = -1; i <= 1; i++) {
                    createProjectile(this.x, this.y, angleToPlayer + (i * coneSpread), this.damage, 1, 'enemy', true); // Passa true para isBossProjectile
                }
                this.rangedAttackTimer = BOSS_RANGED_ATTACK_INTERVAL;
            }

            // Ataque em Rajada
            this.burstAttackTimer -= dt;
            if (this.burstAttackTimer <= 0 && distToPlayer <= BOSS_RANGED_MAX_ATTACK_RANGE * 1.1) { // Alcance um pouco maior para a rajada
                for (let i = 0; i < BOSS_RANGED_BURST_PROJECTILES; i++) {
                    setTimeout(() => {
                        // Recalcula o ângulo para cada projétil da rajada, caso o jogador se mova
                        const currentAngleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
                        createProjectile(this.x, this.y, currentAngleToPlayer, this.damage * 0.7, 1, 'enemy', true); // Dano menor na rajada, projétil de boss
                    }, i * 50); // Intervalo pequeno entre os disparos da rajada
                }
                this.burstAttackTimer = BOSS_RANGED_BURST_COOLDOWN;
            }
        },

        draw: function () {
            ctx.fillStyle = this.color;
            const screenX = this.x - camera.x;
            const screenY = this.y - camera.y;
            const drawRadius = this.radius;

            if (this.isBoss) {
                ctx.beginPath();
                ctx.arc(screenX, screenY, drawRadius, 0, Math.PI * 2);
                ctx.fill();
                // Adicionar uma borda ou aura para o boss
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 3;
                ctx.stroke();
            } else if (this.type === 'melee') {
                ctx.fillRect(screenX - drawRadius, screenY - drawRadius, drawRadius * 2, drawRadius * 2);
            } else {
                ctx.beginPath();
                ctx.moveTo(screenX, screenY - drawRadius * 1.2);
                ctx.lineTo(screenX - drawRadius, screenY + drawRadius * 0.8);
                ctx.lineTo(screenX + drawRadius, screenY + drawRadius * 0.8);
                ctx.closePath();
                ctx.fill();
            }

            if (this.hp < this.maxHp) {
                const barWidth = drawRadius * 2;
                const barHeight = 5;
                ctx.fillStyle = 'grey';
                ctx.fillRect(screenX - drawRadius, screenY - drawRadius - barHeight - 3, barWidth, barHeight);
                ctx.fillStyle = 'darkred';
                ctx.fillRect(screenX - drawRadius, screenY - drawRadius - barHeight - 3, barWidth * (this.hp / this.maxHp), barHeight);
            }
        },

        takeDamage: function (amount) {
            this.hp -= amount;
            if (this.hp <= 0) {
                this.die();
            }
        },

        die: function () {
            // Usa o BASE_XP_DROP + o bônus atual
            createXPOrb(this.x, this.y, currentXpDrop); // Usa o currentXpDrop definido na criação
            score++;

            if (this.isBoss) {
                bossActive = false; // Permite que inimigos normais voltem a spawnar
                player.levelsSinceLastBoss = 0; // Reseta o contador para o próximo boss
            }

            if (player.upgrades.enemyDeathExplosion) {
                const directions = [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2];
                directions.forEach(angle => {
                    createProjectile(this.x, this.y, angle, Math.max(1, this.damage / 2), 1, 'enemy_explosion');
                });
            }
            enemies = enemies.filter(e => e !== this);
        }
    };

    if (isBoss) bossActive = true;
    enemies.push(enemy);
}

// --- Projectile Object ---
function createProjectile(x, y, angle, damage, penetration, owner, isBossProjectile = false) {
    let projectileColor = '#c92e2e'; // Khaki (Jogador)
    let projectileRadius = 0.1 * TILE_SIZE;
    let projectileSpeed = 9 * TILE_SIZE;

    if (owner === 'enemy') {
        projectileColor = isBossProjectile ? '#FF6347' : '#CD5C5C'; // Boss projectile mais vibrante
        projectileRadius = (isBossProjectile ? 0.2 : 0.12) * TILE_SIZE; // Boss projectile maior
        projectileSpeed = (isBossProjectile ? 7 : 6) * TILE_SIZE;
    } else if (owner === 'enemy_explosion') {
        projectileColor = '#d2b41e'; // Chocolate
        projectileRadius = 0.11 * TILE_SIZE;
        projectileSpeed = 5 * TILE_SIZE;
    }


    projectiles.push({
        x: x,
        y: y,
        radius: projectileRadius,
        color: projectileColor,
        speed: projectileSpeed,
        dx: Math.cos(angle),
        dy: Math.sin(angle),
        damage: damage,
        penetrationLeft: penetration,
        owner: owner,
        hitTargets: [],
        lifeTime: owner === 'player' ? (PLAYER_MAX_ATTACK_RANGE / (projectileSpeed * 0.9)) : (ENEMY_RANGED_MAX_ATTACK_RANGE / (projectileSpeed * 0.9)),

        update: function (dt) {
            this.x += this.dx * this.speed * dt;
            this.y += this.dy * this.speed * dt;
            this.lifeTime -= dt;
        },

        draw: function () {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            // Para projéteis inimigos, podemos adicionar um contorno para destaque
            if (this.owner === 'enemy' || this.owner === 'enemy_explosion') {
                ctx.strokeStyle = 'black'; // Contorno preto
                ctx.lineWidth = 2;
                ctx.arc(this.x - camera.x, this.y - camera.y, this.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke(); // Desenha o contorno
            } else {
                ctx.arc(this.x - camera.x, this.y - camera.y, this.radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    });
}

// --- XP Orb Object ---
function createXPOrb(x, y, value) {
    xpOrbs.push({
        x: x,
        y: y,
        radius: 0.12 * TILE_SIZE, // Ajustado
        color: 'purple',
        value: value,
        draw: function () {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x - camera.x, this.y - camera.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

// --- Game Logic Functions ---
function findNearestEnemy(x, y, maxRange = Infinity) { // Added maxRange parameter
    let nearest = null;
    let nearestDist = maxRange; // Initialize with maxRange
    enemies.forEach(enemy => {
        const dist = Math.hypot(enemy.x - x, enemy.y - y);
        if (dist < nearestDist) {
            nearest = enemy;
            nearestDist = dist;
        }
    });
    return nearest;
}

function checkCollisions() {
    // Projectiles vs Entities
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        if (!p || p.lifeTime <= 0) { // Adicionado !p para segurança após splice
            if (p) projectiles.splice(i, 1); // Verifica se p ainda existe antes de splice
            continue;
        }

        let projectileRemoved = false;

        if (p.owner === 'player') {
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j];
                if (!e) continue; // Segurança se inimigo foi removido em outro lugar
                if (p.hitTargets.includes(e)) continue;

                const dist = Math.hypot(p.x - e.x, p.y - e.y);
                if (dist < p.radius + e.radius) {
                    e.takeDamage(p.damage);
                    p.hitTargets.push(e);
                    p.penetrationLeft--;
                    if (p.penetrationLeft <= 0) {
                        projectiles.splice(i, 1);
                        projectileRemoved = true;
                        break;
                    }
                }
            }
        } else if (p.owner === 'enemy') { // Projéteis normais de inimigos
            const distToPlayer = Math.hypot(p.x - player.x, p.y - player.y);
            if (distToPlayer < p.radius + player.radius) {
                if (!player.isInvincible) {
                    player.takeDamage(p.damage);
                }
                projectiles.splice(i, 1);
                projectileRemoved = true;
            }
        } else if (p.owner === 'enemy_explosion') { // <<<<<<<<<<< MODIFICADO AQUI
            // Projéteis de explosão de inimigos SÓ ATINGEM OUTROS INIMIGOS
            for (let j = enemies.length - 1; j >= 0; j--) {
                const e = enemies[j];
                if (!e) continue;
                if (p.hitTargets.includes(e)) continue;

                const dist = Math.hypot(p.x - e.x, p.y - e.y);
                if (dist < p.radius + e.radius) {
                    e.takeDamage(p.damage); // Dano da explosão nos inimigos
                    p.hitTargets.push(e);
                    p.penetrationLeft--;
                    if (p.penetrationLeft <= 0) {
                        projectiles.splice(i, 1);
                        projectileRemoved = true;
                        break;
                    }
                }
            }
        }

        if (!projectileRemoved && (p.x < camera.x - 2 * TILE_SIZE || p.x > camera.x + camera.width + 2 * TILE_SIZE ||
            p.y < camera.y - 2 * TILE_SIZE || p.y > camera.y + camera.height + 2 * TILE_SIZE)) {
            if (projectiles[i] === p) {
                projectiles.splice(i, 1);
            }
        }
    }

    // Player vs Enemies (Melee Contact)
    if (!player.isInvincible) {
        enemies.forEach(e => {
            if (!e) return;
            const dist = Math.hypot(player.x - e.x, player.y - e.y);
            if (dist < player.radius + e.radius) {
                if (e.type === 'melee' || (e.type === 'ranged' && dist < player.radius + e.radius - (0.1 * TILE_SIZE))) {
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
                const e1 = enemies[i];
                const e2 = enemies[j];
                const dist = Math.hypot(e1.x - e2.x, e1.y - e2.y);
                const minAllowedDist = (e1.radius + e2.radius) * 0.9;

                if (dist < minAllowedDist && dist > 0.001) {
                    const overlap = (minAllowedDist - dist);
                    const angle = Math.atan2(e1.y - e2.y, e1.x - e2.x);

                    const pushStrength = 0.5;
                    const pushX = Math.cos(angle) * overlap * pushStrength;
                    const pushY = Math.sin(angle) * overlap * pushStrength;

                    e1.x += pushX;
                    e1.y += pushY;
                    e2.x -= pushX;
                    e2.y -= pushY;
                }
            }
        }
    }
}


function updateUI() {
    hpBar.style.width = (player.hp / player.maxHp) * 100 + '%';
    hpText.textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
    xpBar.style.width = (player.xp / player.xpToNextLevel) * 100 + '%';
    xpText.textContent = `${player.xp}/${player.xpToNextLevel}`;
    levelText.textContent = `Nível: ${player.level}`;
    timerText.textContent = `Tempo: ${Math.floor(gameTime / 1000)}s`;
    scoreText.textContent = `Abates: ${score}`;

    if (gameState === 'paused') {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "white";
        ctx.font = "48px Arial";
        ctx.textAlign = "center";
        ctx.fillText("PAUSADO", canvas.width / 2, canvas.height / 2);
        ctx.font = "24px Arial";
        ctx.fillText("Pressione ESPAÇO para continuar", canvas.width / 2, canvas.height / 2 + 50);
        ctx.restore();
    }
}

function spawnEnemies(dt) {
    enemySpawnTimer += dt * 1000;
    if (enemySpawnTimer > enemySpawnInterval) {
        const baseSpawnCount = 1 + Math.floor(gameTime / 15000);
        const spawnCountVariance = Math.floor(baseSpawnCount * 0.5);
        const numToSpawn = baseSpawnCount + Math.floor(Math.random() * (spawnCountVariance + 1)) - Math.floor(spawnCountVariance / 2);

        for (let i = 0; i < Math.max(1, numToSpawn); i++) {
            createEnemy(Math.random() < 0.35 ? 'ranged' : 'melee');
        }
        enemySpawnTimer = 0;
    }
}

function scaleEnemies(dt) {
    enemyStrengthTimer += dt * 1000;
    if (enemyStrengthTimer > enemyStrengthInterval) {
        enemyBaseStats.hp = Math.floor(enemyBaseStats.hp * 1.12);
        enemyBaseStats.damage = Math.floor(enemyBaseStats.damage * 1.1);
        enemyBaseStats.rangedDamage = Math.floor(enemyBaseStats.rangedDamage * 1.1);
        enemyBaseStats.colorLevel++;
        enemyBaseStats.xpBonus += 1; // <<<<<<<<<<<<<<< AUMENTA O BÔNUS DE XP AQUI
        enemyStrengthTimer = 0;
        // console.log("Enemies stronger! New XP Bonus:", enemyBaseStats.xpBonus); // Para debug
    }
}

// --- Upgrade System ---
const allUpgrades = [
    { name: "+10% Dano", apply: (p) => p.damage = parseFloat((p.damage * 1.1).toFixed(2)) },
    { name: "+5% Vel. Movimento", apply: (p) => p.speed *= 1.05 },
    { name: "+10% Vel. Ataque", apply: (p) => p.attackSpeed = parseFloat((p.attackSpeed * 0.9).toFixed(3)) },
    { name: "+1 Regeneração de Vida/3s", apply: (p) => p.hpRegenRate += 2 },
    {
        name: "+10% Vida Máxima", apply: (p) => {
            const increase = Math.floor(p.maxHp * 0.1);
            p.maxHp += Math.max(10, increase);
            p.hp += Math.max(10, increase);
            p.hp = Math.min(p.hp, p.maxHp);
        }
    },
    { name: "+1 Penetração de Tiro", apply: (p) => p.projectilePenetration += 1 },
    { name: "+1 Tiro Extra", apply: (p) => p.projectilesPerShot += 1 },
    { name: "Explosão ao Abater Inimigo", apply: (p) => { p.upgrades.enemyDeathExplosion = true; /* console.log("Explosion upgrade active"); */ }, unique: true, description: "Inimigos explodem ao morrer, causando dano a OUTROS INIMIGOS." }, // Descrição atualizada
    { name: "+20% Alcance de Coleta XP", apply: (p) => p.pickupRadius *= 1.2 },
    { name: "Cura Total (Anjo)", apply: (p) => { p.hp = p.maxHp; }, unique: true, description: "Restaura toda a sua vida instantaneamente." } // <<<<<< NOVA MELHORIA
];

let playerChosenUniqueUpgrades = new Set();

function showLevelUpOptions() { // Esta função já pausa o jogo via gameState = 'levelUp'
    levelUpScreen.classList.remove('hidden');
    upgradeOptionsContainer.innerHTML = '';

    let availableUpgrades = [...allUpgrades];
    availableUpgrades = availableUpgrades.filter(upg => !(upg.unique && playerChosenUniqueUpgrades.has(upg.name)));

    for (let i = availableUpgrades.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableUpgrades[i], availableUpgrades[j]] = [availableUpgrades[j], availableUpgrades[i]];
    }

    const optionsToShow = Math.min(3, availableUpgrades.length);
    for (let i = 0; i < optionsToShow; i++) {
        const upgrade = availableUpgrades[i];
        const button = document.createElement('button');
        button.textContent = upgrade.name;
        if (upgrade.description) {
            button.title = upgrade.description;
        }
        button.onclick = () => selectUpgrade(upgrade);
        upgradeOptionsContainer.appendChild(button);
    }
}

function selectUpgrade(upgrade) {
    upgrade.apply(player);
    if (upgrade.unique) {
        playerChosenUniqueUpgrades.add(upgrade.name);
    }
    levelUpScreen.classList.add('hidden');
    gameState = 'playing'; // Resume o jogo
    lastTime = performance.now();
    requestAnimationFrame(gameLoop); // Reinicia o loop explicitamente
}

// --- Background Drawing ---
function drawBackground() {
    const TILE_COLOR_1 = '#555555'; // Cinza Escuro
    const TILE_COLOR_2 = '#6b6b6b'; // Cinza Médio Escuro

    let startCol = Math.floor(camera.x / TILE_SIZE);
    let endCol = Math.ceil((camera.x + camera.width) / TILE_SIZE);
    let startRow = Math.floor(camera.y / TILE_SIZE);
    let endRow = Math.ceil((camera.y + camera.height) / TILE_SIZE);

    for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
            let x = col * TILE_SIZE - camera.x;
            let y = row * TILE_SIZE - camera.y;

            ctx.fillStyle = (row + col) % 2 === 0 ? TILE_COLOR_1 : TILE_COLOR_2;
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        }
    }
}

// --- Game State Functions ---
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    camera.width = canvas.width;
    camera.height = canvas.height;
    if (player) {
        camera.update();
    }
}

function initGame() {
    resizeCanvas();

    player = createPlayer();
    player.x = camera.x + camera.width / 2; // O player começa no "mundo"
    player.y = camera.y + camera.height / 2; // E a câmera é ajustada para ele

    if (player) { // Se o jogador já existia (restart)
        player.levelsSinceLastBoss = 0;
    }

    camera.update();

    bossActive = false;

    enemies = [];
    projectiles = [];
    xpOrbs = [];

    gameTime = 0;
    score = 0;
    enemySpawnTimer = 0;
    enemyStrengthTimer = 0;
    enemyBaseStats = {
        hp: 10,
        damage: 10,
        rangedDamage: 8,
        colorLevel: 0,
        xpBonus: 0 // Resetar o bônus de XP
    };
    playerChosenUniqueUpgrades.clear();

    gameState = 'playing';
    levelUpScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    updateUI();
}

function gameOver() {
    gameState = 'gameOver';
    finalTimeText.textContent = `${Math.floor(gameTime / 1000)}s`;
    finalScoreText.textContent = score;
    finalLevelText.textContent = player.level;
    gameOverScreen.classList.remove('hidden');
}

function restartGame() {
    initGame();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function togglePause() {
    if (gameState === 'playing') {
        gameState = 'paused';
        // A mensagem de pausa será desenhada em updateUI
    } else if (gameState === 'paused') {
        gameState = 'playing';
        lastTime = performance.now(); // Resetar o lastTime para evitar um grande deltaTime
        requestAnimationFrame(gameLoop); // Reiniciar o loop se estava parado
    }
    // Não faz nada se estiver em levelUp ou gameOver
}

// --- Main Game Loop ---
function gameLoop(currentTime) {
    if (gameState === 'gameOver' || gameState === 'levelUp' || gameState === 'paused') {
        // Se pausado, updateUI desenhará a tela de pausa
        // Se levelUp, a tela de levelUp é mostrada e o loop não é reiniciado até a escolha
        // Se gameOver, a tela de gameOver é mostrada
        if (gameState === 'paused') { // Ainda precisa desenhar a tela de pausa
            updateUI(); // Desenha a mensagem de pausa
            requestAnimationFrame(gameLoop); // Continua chamando para manter a tela de pausa responsiva
        } else if (gameState === 'levelUp') {
            // A tela de levelUp é um elemento HTML, então o loop pode parar aqui.
            // O selectUpgrade reiniciará o loop.
            // Para manter a cena estática desenhada:
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawBackground();
            xpOrbs.forEach(orb => orb.draw());
            enemies.forEach(e => e.draw());
            player.draw();
            projectiles.forEach(p => p.draw());
            updateUI(); // UI principal ainda visível sob a tela de level up
        }
        return;
    }

    deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    const MAX_DELTA_TIME = 0.1;
    if (deltaTime > MAX_DELTA_TIME) {
        deltaTime = MAX_DELTA_TIME;
    }

    gameTime += deltaTime * 1000;

    // Update
    player.update(deltaTime);
    camera.update();

    enemies.forEach(e => e.update(deltaTime));
    resolveEnemyCollisions();

    projectiles.forEach(p => p.update(deltaTime));

    spawnEnemies(deltaTime);
    scaleEnemies(deltaTime);
    checkCollisions();

    // Draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    xpOrbs.forEach(orb => orb.draw());
    enemies.forEach(e => e.draw());
    player.draw();
    projectiles.forEach(p => p.draw());
    updateUI();

    requestAnimationFrame(gameLoop);
}

// --- Event Listeners ---
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keysPressed[key] = true;

    if (key === ' ') { // Barra de espaço
        e.preventDefault(); // Evita rolagem da página
        togglePause();
    }

    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => {
    keysPressed[e.key.toLowerCase()] = false;
});
window.addEventListener('resize', resizeCanvas);


// --- Start Game ---
initGame();
lastTime = performance.now();
requestAnimationFrame(gameLoop);