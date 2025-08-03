const router = require('express').Router();
const User = require('../models/User');
const mongoose = require('mongoose');
const { unitSubjectVectorEmbeddings } = require('../constants/vectorEmbeddings');
const { mapSubjectToName } = require('../utils/subjectHelpers');
const jwt = require('jsonwebtoken');

// Helper: Dot product
function dot(a, b) {
    return a.reduce((sum, v, i) => sum + v * b[i], 0);
}
const tempMiddleWare = async (req, res, next) =>{
    const token = req.cookies["SubjectSwapLoginJWT"];
    if (!token) return res.status(401).json({ message: 'Not logged in' });
    await jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ message: 'Invalid token' });
        req.user = decoded;
        next();
    });
};
router.post('/match', tempMiddleWare, async (req, res) => {
    const userId = req.user.userId;
    const object_userId = new mongoose.Types.ObjectId(userId);
    const wantSubject = req.body.wantSubject;

    // Process passed subjects
    const initialSubjects = req.body.mySubjects;
    initialSubjects.forEach(subject => mapSubjectToName(subject));
    const mySubjects = Array.isArray(initialSubjects) ? initialSubjects.map(subject => subject.subjectName) : [];

    if (!wantSubject || typeof wantSubject !== "string") return res.status(400).json({ message: 'Unspecified Subject' });

    const wantVector = unitSubjectVectorEmbeddings[wantSubject];
    if (!wantVector) return res.status(400).json({ message: "No matching subject found" });

    // Business Logic
    try {
        const users = await User.aggregate([
            { $match: { active: true, _id: { $ne: object_userId } } },
            { $addFields: {
                totalScore: {
                    $add: [
                        {
                            $sum: {
                                $map: {
                                    input: "$teachingSubjects",
                                    as: "subj",
                                    in: {
                                        $cond: [
                                            { $and: [
                                                "$$subj.active",
                                                { $isArray: "$$subj.subjectVector" },
                                                { $eq: [ { $size: "$$subj.subjectVector" }, wantVector.length ] }
                                            ] },
                                            {
                                                $let: {
                                                    vars: {
                                                        dotScore: {
                                                            $reduce: {
                                                                input: { $range: [0, wantVector.length] },
                                                                initialValue: 0,
                                                                in: {
                                                                    $add: [
                                                                        "$$value",
                                                                        { $multiply: [
                                                                            { $arrayElemAt: ["$$subj.subjectVector", "$$this"] },
                                                                            { $arrayElemAt: [ { $literal: wantVector }, "$$this" ] }
                                                                        ]}
                                                                    ]
                                                                }
                                                            }
                                                        },
                                                        avg_rating: {
                                                            $cond: [
                                                                { $gt: ["$$subj.noOfRatings", 0] },
                                                                { $divide: ["$$subj.totalReceivedRatings", "$$subj.noOfRatings"] },
                                                                0
                                                            ]
                                                        }
                                                    },
                                                    in: {
                                                        $let: {
                                                            vars: {
                                                                baseScore: {
                                                                    $multiply: [
                                                                        "$$dotScore",
                                                                        { $add: [
                                                                            { $divide: ["$$subj.selfRating", 2] },
                                                                            { $cond: [
                                                                                { $gt: ["$$subj.noOfRatings", 0] },
                                                                                "$$avg_rating",
                                                                                0
                                                                            ]}
                                                                        ]}
                                                                    ]
                                                                },
                                                                penalty: {
                                                                    $cond: [
                                                                        { $and: [
                                                                            { $gt: ["$$subj.noOfRatings", 100] },
                                                                            { $lt: ["$$subj.totalReceivedRatings", 4] }
                                                                        ] },
                                                                        -4,
                                                                        {
                                                                            $cond: [
                                                                                { $and: [
                                                                                    { $gt: ["$$subj.noOfRatings", 100] },
                                                                                    { $gt: ["$$subj.totalReceivedRatings", 7] }
                                                                                ] },
                                                                                3,
                                                                                0
                                                                            ]
                                                                        }
                                                                    ]
                                                                },
                                                                diffPenalty: {
                                                                    $cond: [
                                                                        { $and: [
                                                                            { $gt: ["$$subj.noOfRatings", 0] },
                                                                            { $gt: [
                                                                                { $abs: { $subtract: ["$$subj.selfRating", "$$avg_rating"] } },
                                                                                5
                                                                            ]}
                                                                        ] },
                                                                        -4,
                                                                        0
                                                                    ]
                                                                }
                                                            },
                                                            in: {
                                                                $add: [
                                                                    "$$baseScore",
                                                                    "$$penalty",
                                                                    "$$diffPenalty"
                                                                ]
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                            0
                                        ]
                                    }
                                }
                            }
                        },
                        {
                            $multiply: [
                                {
                                    $size: {
                                        $setIntersection: [
                                            "$learningSubjects",
                                            { $literal: mySubjects }
                                        ]
                                    }
                                },
                                3
                            ]
                        }
                    ]
                }
            }},
            { $match: { totalScore: { $gt: 0 } } },
            { $sort: { totalScore: -1 } },
            { $project: {
                username: 1,
                profilePic: "$profilePicUrl",
                languages: 1,
                teachingSubjects: 1,
                learningSubjects: 1,
                personalityRating: 1,
                totalScore: 1
            }}
        ]);

        // No more required
        // Give each subject a name.
        // users.forEach(user => {
        //     if (user.teachingSubjects && user.teachingSubjects.length > 0) {
        //         user.teachingSubjects.forEach(subject => {
        //             mapSubjectToName(subject);
        //         });
        //     }
        // });

        res.status(200).json({ users });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
})

module.exports = router;