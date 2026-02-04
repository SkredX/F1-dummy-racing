import { Server } from 'socket.io';

const io = new Server(3000, {
    cors: {
        origin: '*', // Allow all for dev
    }
});

const players = {};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinGame', (data) => {
        players[socket.id] = {
            id: socket.id,
            team: data.team,
            x: 0,
            y: 2,
            z: 0,
            qx: 0,
            qy: 0,
            qz: 0,
            qw: 1
        };

        // Send current players to new player
        socket.emit('currentPlayers', players);

        // Broadcast new player to everyone else
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].z = movementData.z;
            players[socket.id].qx = movementData.qx;
            players[socket.id].qy = movementData.qy;
            players[socket.id].qz = movementData.qz;
            players[socket.id].qw = movementData.qw;

            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

console.log('Socket.io server running on port 3000');
