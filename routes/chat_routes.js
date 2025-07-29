const express = require('express');
const router = express.Router();
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { getUserOrder } = require('../utils/conversationHelpers');
const { default: mongoose } = require('mongoose');

const tempMiddleWare = (req, res, next) => {
    const userId = req.cookies["SubjectSwapLoginJWT"];
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    jwt.verify(userId, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        req.user = decoded;
        next();
    });
}

router.post('/previous_chats', tempMiddleWare, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Fetch all conversations where participantId contains userId
        const conversations = await Conversation.find({
            participantId: { $regex: userId }
        }).lean();

        if (!conversations || conversations.length === 0) {
            return res.status(200).json([]);
        }

        // Filter out documents with repeating participantId
        const uniqueMap = {};
        conversations.forEach(conv => {
            if (!uniqueMap[conv.participantId]) {
                uniqueMap[conv.participantId] = conv;
            }
        });
        const uniqueConversations = Object.values(uniqueMap);

        // Extract otherId from participantId
        const otherIds = uniqueConversations.map(conv => {
            const [id1, id2] = conv.participantId.split('_');
            return id1 === userId ? id2 : id1;
        });

        // Fetch user details for otherIds
        const users = await User.find({ _id: { $in: otherIds }, active: true }, '_id username profilePicUrl').lean();

        // Map users to objects
        const userList = users.map(u => ({
            convo_id: u._id,
            name: u.username,
            profilePic: u.profilePicUrl
        }));

        return res.status(200).json(userList);
    } catch (err) {
        console.error('Error in /previous_chats:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/get_user_info', tempMiddleWare, async (req, res) => {
    const uuid = req.body.uuid;
    if (!uuid) return res.status(401).json({ error: 'Unauthorized' });

    const mongoUUID = new mongoose.Types.ObjectId(uuid);
    try{
        const user = await User.findOne({ _id: mongoUUID }, '_id username profilePicUrl').lean();
        if (!user) return res.status(404).json({ error: 'User not found' });

        return res.status(200).json({
            convo_id: user._id,
            name: user.username,
            profilePic: user.profilePicUrl
        });
    } catch (err) {
        console.error('Error in /get_user_info:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
})

module.exports = router;