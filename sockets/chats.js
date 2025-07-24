const jwt = require('jsonwebtoken');
const { GridFSBucket } = require('mongodb');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { getUserOrder, getFromBoolean, getActualSender } = require('../utils/conversationHelpers');
const { xorId } = require('../utils/encryptionHelpers');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() }); // For in-memory file uploads
const streamifier = require('streamifier'); // Add this at the top
const mongoose = require('mongoose');

// Configure cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

function private_chat(io) {
    const private_chat_io = io.of('/private_chat');

    // Socket.io connection
    private_chat_io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        // console.log(socket.handshake);
        if (!token) return next(new Error('Authentication error'));

        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) return next(new Error('Authentication error'));
            socket.user = decoded;
            next();
        });
    });

    private_chat_io.on('connection', (socket) => {
        const userId = socket.user.userId;

        socket.on('join_conversation', ({ to }) => {
            const { usersString } = getUserOrder(userId, to);
            socket.join(usersString);
        });

        socket.on('offline', ({ to }) => {
            const { usersString } = getUserOrder(userId, to);
            socket.leave(usersString);
        });

        socket.on('previous_chats', async ({ to }) => {
            const { users, isUser1First, usersString } = getUserOrder(userId, to);
            try {
                // Fetch all conversations for this participantId, latest first
                let conversations = await Conversation.find({
                    participantId: usersString
                }).sort({ 'messages.timestamp': -1 }).lean();

                let selectedConversations = [];
                let archived = false;

                if (conversations.length === 0) {
                    // No conversation exists, create one with empty messages
                    await Conversation.create({
                        participantId: usersString,
                        messages: []
                    });
                    socket.emit('previous_chats', {
                        archived: false,
                        chats: []
                    });
                    return;
                }

                if (conversations.length === 1 || (conversations[0].messages.length > 100)) {
                    // Only one document or latest has >100 messages
                    selectedConversations = [conversations[0]];
                    archived = conversations.length > 1;
                } else if (conversations.length >= 2) {
                    // Merge latest and second latest
                    const merged = {
                        ...conversations[0],
                        messages: [...conversations[0].messages, ...conversations[1].messages]
                    };
                    selectedConversations = [merged];
                    archived = true;
                }

                // Format conversations and add byMe to each message
                const formattedConversations = selectedConversations.map(conversation => {
                    const formattedMessages = conversation.messages.map(msg => ({
                        ...msg,
                        byMe: getActualSender(msg.from, users) === userId,
                        deleted: msg.type === 'deleted'
                    }));

                    return formattedMessages;
                });

                socket.emit('previous_chats', {
                    archived,
                    chats: formattedConversations.flat()
                });
            } catch (err) {
                console.error('Error fetching previous chats:', err);
            }
        });

        socket.on('message_sent', async ({ to, content, type, filedata }) => {
            const { users, usersString } = getUserOrder(userId, to);
            try {
                // Find latest conversation for this participantId
                let conversation = await Conversation.findOne({ participantId: usersString })
                    .sort({ 'messages.timestamp': -1 });

                // Prepare message object with ObjectId and timestamp
                const msgId = new mongoose.Types.ObjectId();
                let messageObj = {
                    from: getFromBoolean(userId, users),
                    type,
                    id: msgId,
                    timestamp: new Date()
                };

                if (type === 'text') {
                    messageObj.content = content;
                } else if (type === 'file' && filedata && filedata.buffer && filedata.name) {
                    // Extract file extension
                    const ext = filedata.name.split('.').pop();
                    // Upload file buffer to Cloudinary with extension in public_id
                    const uploadFromBuffer = () => {
                        return new Promise((resolve, reject) => {
                            const publicId = `chat_files/${msgId.toString()}.${ext}`;
                            const uploadStream = cloudinary.uploader.upload_stream(
                                {
                                    resource_type: 'auto',
                                    public_id: publicId,
                                    use_filename: true,
                                    unique_filename: false,
                                    overwrite: true
                                },
                                (error, result) => {
                                    if (error) return reject(error);
                                    resolve(result);
                                }
                            );
                            streamifier.createReadStream(filedata.buffer).pipe(uploadStream);
                        });
                    };

                    const result = await uploadFromBuffer();
                    messageObj.content = result.secure_url;
                    messageObj.type = 'file';
                }

                let newDoc = false;
                if (!conversation || conversation.messages.length >= 1000) {
                    // Create new conversation document
                    conversation = new Conversation({
                        participantId: usersString,
                        messages: [messageObj],
                        noOfMessages: 1
                    });
                    newDoc = true;
                } else {
                    // Append to existing
                    conversation.messages.push(messageObj);
                    conversation.noOfMessages = (conversation.noOfMessages || 0) + 1;
                }
                await conversation.save();

                // Format message for emit
                const formattedMsg = {
                    ...messageObj,
                    byMe: false, // for receiver
                    deleted: messageObj.type === 'deleted'
                };

                // Emit to sender only
                socket.emit('message_received', {
                    ...formattedMsg,
                    byMe: true
                });

                // Emit to all other sockets in the conversation room (receiver)
                socket.to(usersString).emit('message_received', {
                    ...formattedMsg,
                    byMe: false
                });

            } catch (err) {
                console.error('Error sending message:', err);
            }
        });
    });

}

module.exports = private_chat;