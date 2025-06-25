const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*', // In production, specify your frontend URL
        methods: ['GET', 'POST']
    }
});

const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI)
.then(() => console.log("mongoose connected"))
.catch(err => {
    console.error("Mongoose connection error:", err);
    process.exit(1); // Optionally exit if DB connection fails
});


const Room = require('./models/Room');

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create room
    socket.on('create-room', async ({ roomId, type, password }) => {
        try {
            const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;
            const newRoom = new Room({
                roomId,
                type,
                password: hashedPassword
            });
            await newRoom.save();
            socket.emit('room-created', { roomId });
        } catch (err) {
            socket.emit('room-error', 'Room already exists or error creating room');
        }
    });

    // Join room with access control
    socket.on('join-room', async ({ roomId, password, role, username }) => {
        const room = await Room.findOne({ roomId });
        if (!room) {
            socket.emit('room-error', 'Room does not exist');
            return;
        }
        if (room.type === 'private') {
            const match = await bcrypt.compare(password || '', room.password || '');
            if (!match) {
                socket.emit('room-error', 'Incorrect password');
                return;
            }
        }
        // Add user to room in DB
        room.users.push({ socketId: socket.id, username, role });
        await room.save();

        socket.join(roomId);
        socket.emit('room-joined', { roomId, role });
        // send latest canvas to the new user
        if (room.canvasState) {
            socket.emit('drawing', room.canvasState);
        }
    });

    // Relay object-level events for real-time sync
    socket.on('object:added', ({ roomId, obj }) => {
        socket.to(roomId).emit('object:added', { obj });
    });

    socket.on('object:modified', ({ roomId, obj }) => {
        socket.to(roomId).emit('object:modified', { obj });
    });

    socket.on('object:removed', ({ roomId, id }) => {
        socket.to(roomId).emit('object:removed', { id });
    });


    // Drawing/canvas update (no permission check here, but you can add one if needed)
    socket.on('drawing', async ({ roomId, data }) => {
        await Room.findOneAndUpdate({ roomId }, { canvasState: data });
        socket.to(roomId).emit('drawing', data);
    });

    // Canvas actions with permission check
    socket.on('canvas-action', async ({ roomId, action, payload }) => {
        const room = await Room.findOne({ roomId });
        if (!room) {
            socket.emit('access-denied', 'Room does not exist');
            return;
        }
        const user = room.users.find(u => u.socketId === socket.id);
        if (!user || user.role !== 'editor') {
            socket.emit('access-denied', 'You do not have edit permission');
            return;
        }
        socket.to(roomId).emit('canvas-action', { action, payload });
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
        await Room.updateMany(
            {},
            { $pull: { users: { socketId: socket.id } } }
        );
    });
});

const PORT = process.env.PORT;
server.listen(PORT || 4000, () => {
    console.log(`Server running on port ${PORT}`);
});
