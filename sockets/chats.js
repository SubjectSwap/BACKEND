const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { getUserOrder, getFromBoolean, getActualSender } = require('../utils/conversationHelpers');
const { xorId } = require('../utils/encryptionHelpers');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() }); // For in-memory file uploads
const streamifier = require('streamifier'); // Add this at the top
const mongoose = require('mongoose');
const crypto = require('crypto');

// Configure cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Generate server key pair (do this once, outside the function)
const serverKeyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// In-memory map to store user public keys for this session
const userPublicKeys = new Map();

function private_chat(io) {
    const private_chat_io = io.of('/private_chat');

    // Socket.io connection
    private_chat_io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('Authentication error'));

        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) return next(new Error('Authentication error'));
            socket.user = decoded;
            next();
        });
    });

    private_chat_io.on('connection', (socket) => {
        const userId = socket.user.userId;

        // 1. On join_conversation, receive and store client's public key
        socket.on('join_conversation', ({ to, publicKey }) => {
            if (to==socket.user.userId) {
                socket.emit("cantConnectWithSelf");
                socket.disconnect(true);
                return;
            }
            try{
                const isUserToRealChecker = User.findById(new mongoose.Types.ObjectId(to));
                if(!isUserToRealChecker) {
                    socket.emit("failedConnection");
                    socket.disconnect(true);
                    return;
                }
            } catch(e){
                socket.emit("failedConnection");
                socket.disconnect(true);
                return;
            }
            const { usersString } = getUserOrder(userId, to);
            socket.join(usersString);
            if (publicKey) {
                userPublicKeys.set(userId, publicKey);
            }
        });

        // 2. On offline, remove user from room but keep key for session
        socket.on('offline', ({ to }) => {
            const { usersString } = getUserOrder(userId, to);
            socket.leave(usersString);
        });

        // 3. On disconnect, remove user's public key
        socket.on('disconnect', () => {
            userPublicKeys.delete(userId);
        });

        // 4. previous_chats: fetch and encrypt content for this user
        socket.on('previous_chats', async ({ to }) => {
            if (to==socket.user.userId) {
                socket.emit("cantConnectWithSelf");
                socket.disconnect(true);
                return;
            }
            try {
                const { users, isUser1First, usersString } = getUserOrder(userId, to);
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
                        server_public_key: serverKeyPair.publicKey,
                        archived: false,
                        chats: []
                    });
                    return;
                }

                if (conversations.length === 1 || (conversations[0].messages.length > 100)) {
                    selectedConversations = [conversations[0]];
                    archived = conversations.length > 1;
                } else if (conversations.length >= 2) {
                    const merged = {
                        ...conversations[0],
                        messages: [...conversations[0].messages, ...conversations[1].messages]
                    };
                    selectedConversations = [merged];
                    archived = true;
                }

                // Encrypt content for each message with user's public key 
                const clientPublicKey = userPublicKeys.get(userId);
                const formattedConversations = selectedConversations.map(conversation => {
                    const formattedMessages = conversation.messages.map(msg => {
                        let encryptedContent = msg.content;
                        if (clientPublicKey && msg.content) {
                            try {
                                encryptedContent = crypto.publicEncrypt(
                                    {
                                        key: clientPublicKey,
                                        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                                        oaepHash: "sha256"
                                    },
                                    Buffer.from(msg.content)
                                ).toString('base64');
                            } catch (e) {
                                encryptedContent = msg.content;
                            }
                        }
                        return {
                            ...msg,
                            content: encryptedContent,
                            byMe: getActualSender(msg.from, users) === userId,
                            deleted: msg.type === 'deleted'
                        };
                    });
                    return formattedMessages;
                });
                socket.emit('previous_chats', {
                    server_public_key: serverKeyPair.publicKey,
                    archived,
                    chats: formattedConversations.flat()
                });
            } catch (err) {
                console.error('Error fetching previous chats:', err);
            }
        });

        // 5. message_sent: decrypt content, store plain, encrypt for both sender and receiver
        socket.on('message_sent', async ({ to, content, type, filedata }) => {
            if (to==socket.user.userId) {
                socket.emit("cantConnectWithSelf");
                socket.disconnect(true);
                return;
            }
            const { users, usersString } = getUserOrder(userId, to);
            try {
                // Decrypt content if encrypted with server public key
                let plainContent = content;
                try {
                    plainContent = crypto.privateDecrypt(
                        {
                            key: serverKeyPair.privateKey,
                            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                            oaepHash: "sha256"
                        },
                        Buffer.from(content, 'base64')
                    ).toString('utf8');
                } catch (e) {
                    // Not encrypted, use as is
                }

                const msgId = new mongoose.Types.ObjectId();
                let messageObj = {
                    from: getFromBoolean(userId, users),
                    type,
                    id: msgId,
                    timestamp: new Date()
                };

                if (type === 'text') {
                    messageObj.content = plainContent;
                } else if (type === 'file' && filedata && filedata.buffer && filedata.name) {
                    const ext = filedata.name.split('.').pop().toLowerCase();
                    const isPdf = ext === 'pdf';
                    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);

                    const uploadFromBuffer = () => {
                        return new Promise((resolve, reject) => {
                            const publicId = `chat_files/${msgId.toString()}.${ext}`;
                            const uploadStream = cloudinary.uploader.upload_stream(
                                {
                                    resource_type: isPdf ? 'raw' : (isImage ? 'image' : 'auto'),
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

                // Save to DB as before
                let conversation = await Conversation.findOne({ participantId: usersString })
                    .sort({ 'messages.timestamp': -1 });
                if (!conversation || conversation.messages.length >= 1000) {
                    conversation = new Conversation({
                        participantId: usersString,
                        messages: [messageObj],
                        noOfMessages: 1
                    });
                } else {
                    conversation.messages.push(messageObj);
                    conversation.noOfMessages = (conversation.noOfMessages || 0) + 1;
                }
                await conversation.save();

                // Encrypt content for sender and receiver
                const senderPublicKey = userPublicKeys.get(userId);
                const receiverPublicKey = userPublicKeys.get(to);

                let senderMsg = {
                    ...messageObj,
                    byMe: true,
                    deleted: messageObj.type === 'deleted'
                };
                let receiverMsg = {
                    ...messageObj,
                    byMe: false,
                    deleted: messageObj.type === 'deleted'
                };

                // Encrypt for sender
                if (senderPublicKey && messageObj.content) {
                    try {
                        senderMsg.content = crypto.publicEncrypt(
                            {
                                key: senderPublicKey,
                                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                                oaepHash: "sha256"
                            },
                            Buffer.from(messageObj.content)
                        ).toString('base64');
                    } catch (e) {
                        senderMsg.content = messageObj.content;
                    }
                }

                // Encrypt for receiver
                if (receiverPublicKey && messageObj.content) {
                    try {
                        receiverMsg.content = crypto.publicEncrypt(
                            {
                                key: receiverPublicKey,
                                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                                oaepHash: "sha256"
                            },
                            Buffer.from(messageObj.content)
                        ).toString('base64');
                    } catch (e) {
                        receiverMsg.content = messageObj.content;
                    }
                }

                // Emit to sender
                socket.emit('message_received', senderMsg);

                // Emit to receiver
                socket.to(usersString).emit('message_received', receiverMsg);

            } catch (err) {
                console.error('Error sending message:', err);
            }
        });
    });

}

module.exports = private_chat;