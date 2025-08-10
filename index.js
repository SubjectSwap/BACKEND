const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const cookieParser = require('cookie-parser');
const {Server} = require('socket.io');

const {clearUserCache} = require('./utils/clearCache');
const {minTime} = require('./constants/cronJobTimers');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.json());
app.use(cors({
  credentials: true,
  origin: process.env.FRONTEND_URL,
  allowAccessControlAllowOrigin: true,
}));

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat_routes');
const matchMakingRoutes = require('./routes/matchmaking');
const searchRoutes = require('./routes/search');
const ratingRoutes = require('./routes/rating_routes');
app.use('/', authRoutes);
app.use('/chat', chatRoutes);
app.use('/matchmaking', matchMakingRoutes);
app.use('/search', searchRoutes);
app.use('/rating_routes', ratingRoutes);

cron.schedule(`*/${(minTime / 60) / 1000} * * * *`, () => {
  clearUserCache();
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    const server = app.listen(process.env.PORT || 3000, () => console.log('Server running'));
    const io = new Server(server);
    require('./sockets/chats')(io);
  })
  .catch(err => console.error(err));
