const router = require('express').Router();
const User = require('../models/User');

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


module.exports = router;