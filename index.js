const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const cookieParser = require('cookie-parser');

const {clearUserCache} = require('./utils/clearCache');
const {minTime} = require('./constants/cronJobTimers');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors({
  credentials: true,
  origin: process.env.FRONTEND_URL,
}));
app.use(cookieParser());

const authRoutes = require('./routes/auth');
app.use('/', authRoutes);

cron.schedule(`*/${(minTime / 60) / 1000} * * * *`, () => {
  clearUserCache();
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(process.env.PORT || 3000, () => console.log('Server running'));
  })
  .catch(err => console.error(err));
