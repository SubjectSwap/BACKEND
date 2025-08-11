const router = require('express').Router();
const User = require('../models/User');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const tempMiddleWare = async (req, res, next) => {
    // const userId = req.cookies["SubjectSwapLoginJWT"];
    const {token: userId} = req.body;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    jwt.verify(userId, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const {userId: _id} = decoded;
        try {
            const user = await User.findById(_id);
            if (!user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            req.user = user;
            next();
        } catch (e) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    });
}

router.post('/personality', tempMiddleWare, async (req, res) => {
    var {to, rating} = req.body;
    const from = req.user;
    if(!to || !rating) {
        return res.status(400).json({ error: 'Missing parameters' });
    }
    try{
        rating = parseInt(rating);
        const toUser = await User.findById(to);
        // first look if from.peopleIRated[] contains {type: 'personality', to: to} if yes, save old {rating} as oldrating and set {type: 'personality', to: to, rating: rating}
        // and update toUser.personalityRating: {average: old average - oldrating + rating}
        // else if from.peopleIRated[] doesn't contain {type: 'subject', to: to}, append {type: 'personality', to: to, rating: rating}
        // and update toUser.personalityRating: {average: old average + rating, totalRatings: old totalRatings+1}
        if (!toUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        var foundAlready = false;
        for(let i=0; i<from.peopleIRated.length; i++){
            const personalityRating = from.peopleIRated[i];
            if (personalityRating.type === 'personality' && personalityRating.to.toString() === to.toString()) {
                const oldRating = personalityRating.rating;
                personalityRating.rating = rating;
                toUser.personalityRating.average = toUser.personalityRating.average - oldRating + rating;
                foundAlready = true;
                break;
            }
        }
        if(!foundAlready) {
            from.peopleIRated.push({ type: 'personality', to: to, rating: rating });
            toUser.personalityRating.average += rating;
            toUser.personalityRating.totalRatings += 1;
        }
        await from.save();
        await toUser.save();
        return res.status(200).json({ message: 'Rating saved successfully' });
    } catch(e){
        console.log(e);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/subject', tempMiddleWare, async (req, res) => {
    var {to, subjectName, rating} = req.body;
    const from = req.user;
    if(!to || !subjectName || !rating) {
        return res.status(400).json({ error: 'Missing parameters' });
    }
    try{
        rating = parseInt(rating);
        const toUser = await User.findById(to);
        // first look if from.peopleIRated[] contains {type: 'subject', to: to, subjectName: subjectName} if yes, save old {rating} as oldrating and set {type: 'subject', to: to, subjectName: subjectName, rating: rating}
        // and update toUser.teachingSubjects[]: {subjectVector: subjectVector, subjectName: subjectName, selfRating: selfRating, noOfRatings: noOfRatings, totalReceivedRatings: totalReceivedRatings - oldrating + rating}
        // else if from.peopleIRated[] doesn't contain {type: 'subject', to: to, subjectName: subjectName}, append {type: 'subject', to: to, subjectName: subjectName, rating: rating}
        // and update toUser.teachingSubjects[]: {subjectVector: subjectVector, subjectName: subjectName, selfRating: selfRating, noOfRatings: noOfRatings+1, totalReceivedRatings: totalReceivedRatings + rating}
        if (!toUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        var foundAlready = false;
        for(let i=0; i<from.peopleIRated.length; i++){
            const subjectRating = from.peopleIRated[i];
            if (subjectRating.type === 'subject' && subjectRating.to.toString() === to.toString() && subjectRating.subjectName === subjectName) {
                const oldRating = subjectRating.rating;
                subjectRating.rating = rating;
                toUser.teachingSubjects.forEach((subject) => {
                    if (subject.subjectName === subjectName) {
                        subject.totalReceivedRatings = subject.totalReceivedRatings - oldRating + rating;
                    }
                });
                foundAlready = true;
                break;
            }
        }
        if (!foundAlready){
            from.peopleIRated.push({ type: 'subject', to: to, subjectName: subjectName, rating: rating });
            toUser.teachingSubjects.forEach((subject) => {
                if (subject.subjectName === subjectName) {
                    subject.totalReceivedRatings += rating;
                    subject.noOfRatings += 1;
                }
            });
        }
        await from.save();
        await toUser.save();
        return res.status(200).json({ message: 'Rating saved successfully' });
    } catch(e){
        console.log(e);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete("/take_back/personality", tempMiddleWare, async (req, res) => {
    const {to} = req.body;
    const from = req.user;
    if(!to) {
        return res.status(400).json({ error: 'Missing parameters' });
    }
    try{
        const toUser = await User.findById(to);
        if (!toUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        for(let i=0; i<from.peopleIRated.length; i++){
            const personalityRating = from.peopleIRated[i];
            if (personalityRating.type === 'personality' && personalityRating.to.toString() === to.toString()) {
                from.peopleIRated.splice(i, 1);
                toUser.personalityRating.average -= personalityRating.rating;
                toUser.personalityRating.totalRatings -= 1;
                break;
            }
        }
        await from.save();
        await toUser.save();
        return res.status(200).json({ message: 'Rating taken back successfully' });
    } catch(e){
        console.log(e);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete("/take_back/subject", tempMiddleWare, async (req, res) => {
    const {to, subjectName} = req.body;
    const from = req.user;
    if(!to || !subjectName) {
        return res.status(400).json({ error: 'Missing parameters' });
    }
    try{
        const toUser = await User.findById(to);
        if (!toUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        for(let i=0; i<from.peopleIRated.length; i++){
            const subjectRating = from.peopleIRated[i];
            if (subjectRating.type === 'subject' && subjectRating.to.toString() === to.toString() && subjectRating.subjectName === subjectName) {
                from.peopleIRated.splice(i, 1);
                toUser.teachingSubjects.forEach((subject) => {
                    if (subject.subjectName === subjectName) {
                        subject.totalReceivedRatings -= subjectRating.rating;
                        subject.noOfRatings -= 1;
                    }
                });
                break;
            }
        }
        await from.save();
        await toUser.save();
        return res.status(200).json({ message: 'Rating taken back successfully' });
    } catch(e){
        console.log(e);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;