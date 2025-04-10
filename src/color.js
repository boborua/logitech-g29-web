"use strict";

//-------------
// Description
//-------------
// A simplification of https://github.com/chalk/ansi-styles so we do not require a dependency.

//-----------
// Variables
//-----------
let color = {};

const colors = {
  black: [30, 39],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  magenta: [35, 39],
  cyan: [36, 39],
  white: [37, 39],
  gray: [90, 39],
  grey: [90, 39],
  // bright colors
  redBright: [91, 39],
  greenBright: [92, 39],
  yellowBright: [93, 39],
  blueBright: [94, 39],
  magentaBright: [95, 39],
  cyanBright: [96, 39],
  whiteBright: [97, 39],
};

// Browser doesn't need platform detection for colors
// We'll just use the standard colors

//-----------
// Functions
//-----------
function showColor(hue, info = "") {
  // ` signifies a template literal
  return `\u001B[${colors[hue][0]}m` + info + `\u001B[${colors[hue][1]}m`;
} // showColor

function setupColors() {
  for (let item in colors) {
    const hue = item;
    color[hue] = function (info) {
      return showColor(hue, info);
    };
  }
} // setupColors

//------------
// Party Time
//------------
setupColors();

//---------
// Exports
//---------
export default color;
