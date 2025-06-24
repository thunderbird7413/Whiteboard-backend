const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    type: { type: String, enum: ['public', 'private'], default: 'public' },
    password: { type: String }, // Store hashed passwords for security
    users: [
        {
            socketId: String,
            username: String,
            role: { type: String, enum: ['editor', 'viewer'], default: 'viewer' }
        }
    ],
    canvasState: { type: Object }, // Store Fabric.js JSON here
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Room', RoomSchema);
