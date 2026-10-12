const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 2000;

const PLAYER_SIZE = 30;
const PLAYER_SPEED = 5;

const ORB_SPEED = 10;
const ORB_DAMAGE = 20;

const players = {};
const orbs = [];

// ===============================
// WORLD WALLS
// ===============================

const walls = [
    { x: 300, y: 250, w: 500, h: 35 },
    { x: 2200, y: 250, w: 500, h: 35 },

    { x: 300, y: 1715, w: 500, h: 35 },
    { x: 2200, y: 1715, w: 500, h: 35 },

    { x: 250, y: 600, w: 40, h: 350 },
    { x: 700, y: 800, w: 350, h: 40 },

    { x: 2710, y: 600, w: 40, h: 350 },
    { x: 1950, y: 800, w: 350, h: 40 },

    { x: 1200, y: 350, w: 600, h: 45 },
    { x: 1200, y: 1605, w: 600, h: 45 },

    { x: 1050, y: 650, w: 45, h: 300 },
    { x: 1905, y: 650, w: 45, h: 300 },

    { x: 1050, y: 1050, w: 45, h: 300 },
    { x: 1905, y: 1050, w: 45, h: 300 },

    // Center fortress
    { x: 1350, y: 850, w: 300, h: 45 },
    { x: 1350, y: 1105, w: 300, h: 45 },

    { x: 1350, y: 895, w: 45, h: 210 },
    { x: 1605, y: 895, w: 45, h: 210 },

    // Small obstacles
    { x: 500, y: 1250, w: 180, h: 35 },
    { x: 2320, y: 1250, w: 180, h: 35 },

    { x: 500, y: 500, w: 180, h: 35 },
    { x: 2320, y: 500, w: 180, h: 35 }
];


// ===============================
// WALL COLLISION
// ===============================

function collidesWithWall(x, y, size) {

    return walls.some(w =>
        x < w.x + w.w &&
        x + size > w.x &&
        y < w.y + w.h &&
        y + size > w.y
    );
}


// ===============================
// CREATE PLAYER
// ===============================

function createPlayer(id) {

    let x;
    let y;
    let attempts = 0;

    do {

        x = 50 + Math.random() * (WORLD_WIDTH - 100);
        y = 50 + Math.random() * (WORLD_HEIGHT - 100);

        attempts++;

    } while (
        collidesWithWall(x, y, PLAYER_SIZE) &&
        attempts < 200
    );

    const colors = [
        "lime",
        "red",
        "cyan",
        "orange",
        "magenta",
        "yellow"
    ];

    return {

        x,
        y,

        health: 100,

        color:
            colors[
                Object.keys(players).length %
                colors.length
            ],

        input: {
            up: false,
            down: false,
            left: false,
            right: false
        },

        aimX: 1,
        aimY: 0,

        lastShot: 0
    };
}


// ===============================
// PLAYER CONNECTION
// ===============================

io.on("connection", socket => {

    console.log(
        "Player connected:",
        socket.id
    );

    players[socket.id] =
        createPlayer(socket.id);


    socket.emit("welcome", {

        id: socket.id,

        worldWidth: WORLD_WIDTH,

        worldHeight: WORLD_HEIGHT
    });


    // ===========================
    // PLAYER INPUT
    // ===========================

    socket.on("input", data => {

        const player =
            players[socket.id];

        if (!player) return;

        player.input.up =
            !!data.up;

        player.input.down =
            !!data.down;

        player.input.left =
            !!data.left;

        player.input.right =
            !!data.right;


        if (
            Number.isFinite(data.aimX) &&
            Number.isFinite(data.aimY)
        ) {

            const length =
                Math.hypot(
                    data.aimX,
                    data.aimY
                );


            if (length > 0) {

                player.aimX =
                    data.aimX / length;

                player.aimY =
                    data.aimY / length;
            }
        }
    });


    // ===========================
    // SHOOTING
    // ===========================

    socket.on("shoot", () => {

        const player =
            players[socket.id];

        if (!player) return;

        if (player.health <= 0) {
            return;
        }


        const now =
            Date.now();


        // Shooting cooldown
        if (
            now - player.lastShot < 300
        ) {
            return;
        }


        player.lastShot = now;


        orbs.push({

            owner: socket.id,

            x:
                player.x +
                PLAYER_SIZE / 2,

            y:
                player.y +
                PLAYER_SIZE / 2,

            vx:
                player.aimX *
                ORB_SPEED,

            vy:
                player.aimY *
                ORB_SPEED,

            life: 120
        });
    });


    // ===========================
    // PLAYER DISCONNECT
    // ===========================

    socket.on("disconnect", () => {

        console.log(
            "Player disconnected:",
            socket.id
        );


        delete players[socket.id];


        for (
            let i = orbs.length - 1;
            i >= 0;
            i--
        ) {

            if (
                orbs[i].owner ===
                socket.id
            ) {

                orbs.splice(i, 1);
            }
        }
    });

});


// ===============================
// GAME LOOP
// ===============================

setInterval(() => {


    // ===========================
    // MOVE PLAYERS
    // ===========================

    for (const id in players) {

        const player =
            players[id];


        if (player.health <= 0) {
            continue;
        }


        let dx = 0;
        let dy = 0;


        if (player.input.left) {
            dx--;
        }

        if (player.input.right) {
            dx++;
        }

        if (player.input.up) {
            dy--;
        }

        if (player.input.down) {
            dy++;
        }


        // Normalize diagonal movement
        if (
            dx !== 0 &&
            dy !== 0
        ) {

            dx *= Math.SQRT1_2;
            dy *= Math.SQRT1_2;
        }


        const newX =
            player.x +
            dx *
            PLAYER_SPEED;


        const newY =
            player.y +
            dy *
            PLAYER_SPEED;


        // Horizontal collision

        if (
            newX >= 0 &&
            newX <=
                WORLD_WIDTH -
                PLAYER_SIZE &&
            !collidesWithWall(
                newX,
                player.y,
                PLAYER_SIZE
            )
        ) {

            player.x = newX;
        }


        // Vertical collision

        if (
            newY >= 0 &&
            newY <=
                WORLD_HEIGHT -
                PLAYER_SIZE &&
            !collidesWithWall(
                player.x,
                newY,
                PLAYER_SIZE
            )
        ) {

            player.y = newY;
        }
    }


    // ===========================
    // MOVE PROJECTILES
    // ===========================

    for (
        let i = orbs.length - 1;
        i >= 0;
        i--
    ) {

        const orb =
            orbs[i];


        orb.x += orb.vx;
        orb.y += orb.vy;

        orb.life--;


        let removeOrb =
            orb.x < 0 ||
            orb.x > WORLD_WIDTH ||
            orb.y < 0 ||
            orb.y > WORLD_HEIGHT ||
            orb.life <= 0;


        // Wall collision

        if (
            walls.some(w =>
                orb.x >= w.x &&
                orb.x <= w.x + w.w &&
                orb.y >= w.y &&
                orb.y <= w.y + w.h
            )
        ) {

            removeOrb = true;
        }


        // =========================
        // PLAYER DAMAGE
        // =========================

        if (!removeOrb) {

            for (const id in players) {

                const player =
                    players[id];


                if (
                    id === orb.owner ||
                    player.health <= 0
                ) {
                    continue;
                }


                if (
                    orb.x >= player.x &&
                    orb.x <=
                        player.x +
                        PLAYER_SIZE &&
                    orb.y >= player.y &&
                    orb.y <=
                        player.y +
                        PLAYER_SIZE
                ) {

                    player.health =
                        Math.max(
                            0,
                            player.health -
                            ORB_DAMAGE
                        );


                    removeOrb = true;


                    // Respawn
                    if (
                        player.health === 0
                    ) {

                        setTimeout(() => {

                            if (
                                !players[id]
                            ) {
                                return;
                            }


                            const respawn =
                                createPlayer(id);


                            players[id].x =
                                respawn.x;

                            players[id].y =
                                respawn.y;

                            players[id].health =
                                100;

                        }, 2000);
                    }


                    break;
                }
            }
        }


        if (removeOrb) {

            orbs.splice(i, 1);
        }
    }


    // ===========================
    // SEND GAME STATE
    // ===========================

    io.emit("state", {

        players:
            Object.fromEntries(

                Object.entries(
                    players
                ).map(
                    ([id, player]) => [

                        id,

                        {
                            x: player.x,
                            y: player.y,
                            health: player.health,
                            color: player.color
                        }
                    ]
                )
            ),

        orbs,

        walls,

        worldWidth:
            WORLD_WIDTH,

        worldHeight:
            WORLD_HEIGHT
    });


}, 1000 / 30);


// ===============================
// START BLOCK BATTLE SERVER
// ===============================

server.listen(
    process.env.PORT || 3000,
    "0.0.0.0",
    () => {

        console.log(
            "🌎 BLOCK BATTLE SERVER RUNNING!"
        );

        console.log(
            "World:",
            WORLD_WIDTH,
            "x",
            WORLD_HEIGHT
        );

        console.log(
            "Open http://localhost:3000"
        );
    }
);