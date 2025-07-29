
function normalize(vec) {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return norm === 0 ? vec : vec.map(v => v / norm);
}

/**
 * @FundamentalCategories
 * (i.e. normal vectors - they are not subjects)  
 * Physics, Chemistry, Mathematics, Life Sciences,
 * English, History, Political Science,
 * Money Studies, Hindi
 * 
 * @PureSubjects
 * (categories that can be directly mapped to a subject)  
 * Physics, Mathematics, Chemistry, English, History,
 * Hindi
 * 
 * @AuxillarySubjects
 * SST, Geography, Electrochemistry, Biology, Astrophysics,
 * Civics, Macroeconomics, Biochemistry
 */
const subjectVectorEmbeddings = {
    Physics: [1, 0, 0, 0, 0, 0, 0, 0],
    Chemistry: [0, 1, 0, 0, 0, 0, 0, 0],
    Mathematics: [0, 0, 1, 0, 0, 0, 0, 0],
    English: [0, 0, 0, 0, 0, 1, 0, 0],
    History: [0, 0, 0, 0, 0, 0, 1, 0],
    Hindi: [0, 0, 0, 0, 0, 0, 0, 1],
    SST: [0, 0, 0, 0, 1, 1, 1, 0],
    Geography: [0, 0, 0, 0.3, 0.3, 0, 0.7, 0],
    Electrochemistry: [0.7, 1, 0, 0, 0, 0, 0, 0],
    Biology: [0.3, 0.8, 0, 0, 1, 0, 0, 0],
    Astrophysics: [1, 0, 1, 0, 0, 0, 0, 0],
    Civics: [0, 0, 0, 0, 0.6, 1, 0.3, 0],
    Macroeconomics: [0, 0, 0, 0, 0.3, 0.6, 1, 0],
    Biochemistry: [0.2, 1, 0, 1, 0, 0, 0, 0]
};

const unitSubjectVectorEmbeddings = {};
for (const key in subjectVectorEmbeddings) {
    unitSubjectVectorEmbeddings[key] = normalize(subjectVectorEmbeddings[key]);
}

// console.log("Unit Subject Vector Embeddings:", unitSubjectVectorEmbeddings);

module.exports = {
    subjectVectorEmbeddings,
    unitSubjectVectorEmbeddings
};

/*
Unit Subject Vector Embeddings: {
  Physics: [
    1, 0, 0, 0,
    0, 0, 0, 0
  ],
  Chemistry: [
    0, 1, 0, 0,
    0, 0, 0, 0
  ],
  Mathematics: [
    0, 0, 1, 0,
    0, 0, 0, 0
  ],
  English: [
    0, 0, 0, 0,
    0, 1, 0, 0
  ],
  History: [
    0, 0, 0, 0,
    0, 0, 1, 0
  ],
  Hindi: [
    0, 0, 0, 0,
    0, 0, 0, 1
  ],
  SST: [
    0,
    0,
    0,
    0,
    0.5773502691896258,
    0.5773502691896258,
    0.5773502691896258,
    0
  ],
  Geography: [
    0,
    0,
    0,
    0.36650833306891567,
    0.36650833306891567,
    0,
    0.8551861104941365,
    0
  ],
  Electrochemistry: [ 0.5734623443633283, 0.8192319205190405, 0, 0, 0, 0, 0, 0 ],
  Biology: [
    0.22808577638091165,
    0.6082287370157645,
    0,
    0,
    0.7602859212697056,
    0,
    0,
    0
  ],
  Astrophysics: [ 0.7071067811865475, 0, 0.7071067811865475, 0, 0, 0, 0, 0 ],
  Civics: [
    0,
    0,
    0,
    0,
    0.4982728791224398,
    0.8304547985373997,
    0.2491364395612199,
    0
  ],
  Macroeconomics: [
    0,
    0,
    0,
    0,
    0.2491364395612199,
    0.4982728791224398,
    0.8304547985373997,
    0
  ],
  Biochemistry: [
    0.140028008402801,
    0.7001400420140049,
    0,
    0.7001400420140049,
    0,
    0,
    0,
    0
  ]
}
*/