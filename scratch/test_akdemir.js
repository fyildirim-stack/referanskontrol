import { parseReference } from "../src/isnadFormatter.js";

const text = "T. Rogić Lugarić - D. Dodig - J. Bogovac (2019). Effectiveness of blending alternative procurement models and EU funding mechanisms based on energy efficiency case study simulation";
const result = parseReference(text, 1);
console.log(JSON.stringify(result, null, 2));
