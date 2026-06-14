import { findCitations } from "../src/citationFinder.js";

const text1 = "(Rogić Lugarić vd., 2019: 2-3)";
const text2 = "Rogić Lugarić vd. (2019: 2-3)";

console.log("text1 parenthetical:", JSON.stringify(findCitations(text1, 1), null, 2));
console.log("text2 narrative:", JSON.stringify(findCitations(text2, 1), null, 2));
