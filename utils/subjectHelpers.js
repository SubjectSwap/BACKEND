const {unitSubjectVectorEmbeddings} = require('../constants/vectorEmbeddings')

function mapSubjectToName(subject) {
    if (subject.subjectVector) {
        // Find the subject name by matching the vector
        for (const [subjectName, vector] of Object.entries(unitSubjectVectorEmbeddings)) {
            if (JSON.stringify(vector) === JSON.stringify(subject.subjectVector)) {
                subject.subjectName = subjectName;
                break;
            }
        }
    }
}

module.exports = {
    mapSubjectToName
}