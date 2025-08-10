const router = require('express').Router();
const User = require('../models/User');
const mongoose = require('mongoose');

router.post('/person', async (req, res) => {
    try {
        const {query} = req.body;
        if (!query) {
            return res.status(400).json({message: 'No query provided'});
        }
        
        const users = await User.aggregate([
            {
                $search: {
                    index: "username_search_for_users",
                    autocomplete: {
                        query: query,
                        path: "username"
                    }
                }
            },
            {
                $addFields: {
                    score: {
                        $meta: "textScore"
                    },
                    totalTeachingRatings: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$teachingSubjects",
                                        cond: { $eq: ["$$this.active", true] }
                                    }
                                },
                                as: "subject",
                                in: "$$subject.noOfRatings"
                            }
                        }
                    }
                }
            },
            {
                $sort: {
                    score: {$meta: "textScore"},
                    totalTeachingRatings: -1
                }
            },
            {
                $limit: 100
            },
            {
                $project: {
                    _id: 1,
                    username: 1,
                    profilePicUrl: 1
                }
            }
        ]);
        res.json(users);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({message: 'Search operation failed'});
    }
});

router.post('/user/:uuid', async (req, res) => {
    const userId = req.params.uuid;
    if (!userId) return res.status(400).json({message: 'No user provided'});
    try{
        const user = await User.findOne({_id: new mongoose.Types.ObjectId(userId), active: true}, {username: 1, profilePicUrl: 1, teachingSubjects: 1, learningSubjects: 1, personalityRating: 1, languages: 1});
        if(!user) return res.status(404).json({message: 'User not found'});
        res.status(200).json(user);
    }catch (error) {
        console.error('Search error:', error);
        res.status(500).json({message: 'Search operation failed'});
    }
})


module.exports = router;