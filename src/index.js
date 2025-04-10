"use strict";

//----------------
// Includes: Self
//----------------
import color from "./color.js";
import dataMap from "./data-map.js";

//-----------
// Variables
//-----------
const eventEmitter = new EventTarget();
const options = {
  autocenter: true,
  debug: false,
  range: 900,
};

let dataPrev = Array(12);
let device = null;
let ledPrev = [];
let memoryPrev = {
  wheel: {
    turn: 50,
    shift_left: 0,
    shift_right: 0,
    dpad: 0,
    button_x: 0,
    button_square: 0,
    button_triangle: 0,
    button_circle: 0,
    button_l2: 0,
    button_r2: 0,
    button_l3: 0,
    button_r3: 0,
    button_plus: 0,
    button_minus: 0,
    spinner: 0,
    button_spinner: 0,
    button_share: 0,
    button_option: 0,
    button_playstation: 0,
  },
  shifter: {
    gear: 0,
  },
  pedals: {
    gas: 0,
    brake: 0,
    clutch: 0,
  },
};

//-----------
// Functions
//-----------
function clone(obj) {
  /*
    Clone an object.
    @param   {Object}  obj  Object to clone.
    @return  {Object}
    */
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  const temp = obj.constructor();

  for (let key in obj) {
    temp[key] = clone(obj[key]);
  }

  return temp;
} // clone

async function connect(odo) {
  /*
    Connect to a Logitech G29 wheel.
    @param   {Object}  odo  Options object.
    @return  {Promise}  Resolves when connected.
    */
  if (typeof odo === "object") {
    userOptions(odo);
  }

  try {
    // Check if WebHID is supported
    if (!navigator.hid) {
      throw new Error(
        "WebHID API is not supported in this browser. Try Chrome or Edge."
      );
    }

    // Check if we're in a secure context (HTTPS or localhost)
    if (window.isSecureContext === false) {
      throw new Error("WebHID requires a secure context (HTTPS or localhost).");
    }

    // Request the G29 device
    const devices = await navigator.hid.requestDevice({
      filters: [
        { vendorId: 0x046d, productId: 49743 }, // Logitech vendor ID
      ],
    });

    if (devices.length === 0) {
      throw new Error("No G29 device found");
    }

    console.log(devices);

    device = devices[0];

    // Verify the device is a G29
    if (options.debug) {
      console.log(color.cyan("connect -> Device info:"), device);
    }

    // Check if the device is already open
    if (device.opened) {
      if (options.debug) {
        console.log(
          color.cyan("connect -> Device already open, closing first")
        );
      }
      await device.close();
    }

    // Open the device
    await device.open();

    // Set up event listeners
    device.addEventListener("inputreport", handleInputReport);

    // Initialize the wheel
    await initializeWheel();

    return device;
  } catch (err) {
    if (options.debug) {
      console.log(color.red("connect -> Error connecting to device."), err);
    }
    throw err;
  }
} // connect

async function disconnect() {
  /*
    Disconnect in preparation to connect again or to allow other software to use the wheel.
    */
  if (device) {
    device.removeEventListener("inputreport", handleInputReport);
    await device.close();
    device = null;
  }
} // disconnect

function findWheel() {
  /*
    Return the USB location of a Logitech G29 wheel.
    @return  {String}  devicePath  USB path like: USB_046d_c294_fa120000
    */
  // This function is no longer needed with WebHID
  // WebHID handles device selection through the browser UI
  return null;
} // findWheel

function on(str, func) {
  /*
    Add an event listener.
    @param   {String}    str   Event name.
    @param   {Function}  func  Callback function.
    */
  eventEmitter.addEventListener(str, func);
} // on

function once(str, func) {
  /*
    Add a one-time event listener.
    @param   {String}    str   Event name.
    @param   {Function}  func  Callback function.
    */
  const onceFunc = function (event) {
    eventEmitter.removeEventListener(str, onceFunc);
    func(event);
  };
  eventEmitter.addEventListener(str, onceFunc);
} // once

async function relay(data) {
  /*
    Relay low level commands directly to the hardware.
    @param  {Object}  data  Array of data to write. For example: [0x00, 0xf8, 0x12, 0x1f, 0x00, 0x00, 0x00, 0x01]
    */
  if (Array.isArray(data) && device) {
    await device.sendReport(0, new Uint8Array(data));
  }
} // relay

async function relayOS(data) {
  /*
    Relay low level commands directly to the hardware after applying OS specific tweaks, if needed.
    @param  {Object}  data  Array of data to write. For example: [0xf8, 0x12, 0x1f, 0x00, 0x00, 0x00, 0x01]
    */
  if (Array.isArray(data) && device) {
    try {
      await device.sendReport(0, new Uint8Array(data));
    } catch (error) {
      if (options.debug) {
        console.error(color.red("relayOS -> Error sending report:"), error);
        console.log("Data being sent:", data);
      }

      // If we get a NotAllowedError, it might be because the device is in use by another application
      if (error.name === "NotAllowedError") {
        throw new Error(
          "Failed to write to device. The device might be in use by another application or you may need to reconnect it."
        );
      }

      // Re-throw other errors
      throw error;
    }
  }
}

async function setRange() {
  /*
    Set wheel range.
    */
  if (options.range < 40) {
    options.range = 40;
  }

  if (options.range > 900) {
    options.range = 900;
  }

  const range1 = options.range & 0x00ff;
  const range2 = (options.range & 0xff00) >> 8;

  await relayOS([0xf8, 0x81, range1, range2, 0x00, 0x00, 0x00]);
} // setRange

function userOptions(opt) {
  /*
    Set user options.
    @param  {Object}  opt   Options object originally passed into the connect function.
    */
  if (typeof opt !== "object") return;

  for (let i in options) {
    if (opt.hasOwnProperty(i)) {
      options[i] = opt[i];
    }
  }

  if (options.debug) {
    console.log(color.cyan("userOptions -> "), options);
  }
} // userOptions

//----------------
// Function: LEDs
//----------------
async function leds(setting) {
  /*
    Control the shift indicator LEDs using a variety of convenience methods.
    @param  {*}  setting  String, Number, or Array setting. Optional. See API documentation for more info.
    */

  // no setting
  if (typeof setting === "undefined") {
    setting = [];
  }

  // percent based settings
  if (typeof setting === "number") {
    setting = Math.round(setting * 100);

    if (setting > 84) {
      setting = "11111";
    } else if (setting > 69) {
      setting = "1111";
    } else if (setting > 39) {
      setting = "111";
    } else if (setting > 19) {
      setting = "11";
    } else if (setting > 4) {
      setting = "1";
    } else {
      setting = "";
    }
  }

  // string based settings
  if (typeof setting === "string") {
    setting = setting.split("");
  }

  // array based settings
  if (Array.isArray(setting)) {
    if (ledPrev === setting) {
      return;
    }

    const ledValues = [1, 2, 4, 8, 16];

    const ledArray = setting;

    // remove any extra elements
    ledArray.splice(5, ledArray.length - 5);

    const len = ledArray.length;

    setting = 0;

    for (let i = 0; i < len; i++) {
      if (parseInt(ledArray[i]) === 1) {
        setting = setting + ledValues[i];
      }
    }

    /*
        Setting should be a number from 0 to 31

            From outside in, mirrored on each side.

            0 = No LEDs
            1 = Green One
            2 = Green Two
            4 = Orange One
            8 = Orange Two
            16 = Red

            31 = All LEDs
        */

    try {
      await relayOS([0xf8, 0x12, setting, 0x00, 0x00, 0x00, 0x01]);

      // update global variable for next time
      ledPrev = setting;
    } catch (err) {
      // do nothing
    }
  }
} // leds

//------------------
// Functions: Force
//------------------
async function autoCenter() {
  /*
    Set wheel autocentering based on existing options.
    */
  const option = options.autocenter;

  if (option) {
    // auto-center on
    await relayOS([0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

    if (Array.isArray(option) && option.length === 2) {
      // custom auto-center

      // byte 3-4 is effect strength, 0x00 to 0x0f
      option[0] = Math.round(option[0] * 15);

      // byte 5 is the rate the effect strength rises as the wheel turns, 0x00 to 0xff
      option[1] = Math.round(option[1] * 255);

      await relayOS([
        0xfe,
        0x0d,
        option[0],
        option[0],
        option[1],
        0x00,
        0x00,
        0x00,
      ]);
    } else {
      // use default strength profile
      await relayOS([0xfe, 0x0d, 0x07, 0x07, 0xff, 0x00, 0x00, 0x00]);
    }
  } else {
    // auto-center off
    await relayOS([0xf5, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  }
} // autoCenter

async function forceConstant(number) {
  /*
    Set or disable a constant force effect.
    @param  {Number}  number  Number between 0 and 1. Optional.
    */
  if (typeof number === "undefined") number = 0.5;

  if (number === 0.5) {
    await forceOff(1);
    return;
  }

  number = Math.round(Math.abs(number - 1) * 255);

  await relayOS([0x11, 0x00, number, 0x00, 0x00, 0x00, 0x00]);
} // forceConstant

async function forceFriction(number) {
  /*
    Set or disable the amount of friction present when turning the wheel.
    @param  {Number}  number  Number between 0 and 1. Optional.
    */
  if (typeof number === "undefined") number = 0;

  if (number === 0) {
    await forceOff(2);
    return;
  }

  // sending manual relay() commands to the hardware seems to reveal a 0x00 through 0x07 range
  // 0x07 is the strongest friction and then 0x08 is no friction
  // friction ramps up again from 0x08 to 0x0F
  number = Math.round(number * 7);

  // the first "number" is for left rotation, the second for right rotation
  await relayOS([0x21, 0x02, number, 0x00, number, 0x00, 0x00]);
} // forceFriction

async function forceOff(slot) {
  /*
    Turn off all force effects except auto-centering.
    @param  {Number}  slot  Number between 0 and 4. Optional.
    */
  // Great info at http://wiibrew.org/wiki/Logitech_USB_steering_wheel, especially about writing to more than one effect slot.
  if (typeof slot === "undefined") {
    slot = 0xf3;
  } else {
    if (slot === 0) {
      slot = 0xf3;
    } else {
      slot = parseInt("0x" + slot + "0");
    }
  }

  // turn off effects (except for auto-center)
  await relayOS([slot, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
} // forceOff

//------------------
// Function: Listen
//------------------
async function initializeWheel() {
  /*
    Initialize the wheel and set up event handling.
    */
  try {
    // Force off any existing effects
    await forceOff();

    // Set the wheel range
    await setRange();

    // Set up auto-centering
    await autoCenter();

    // Turn off all LEDs
    await leds(0);

    if (options.debug) {
      console.log(color.cyan("initializeWheel -> Wheel initialized"));
    }
  } catch (err) {
    if (options.debug) {
      console.log(
        color.red("initializeWheel -> Error initializing wheel."),
        err
      );
    }
    throw err;
  }
} // initializeWheel

function handleInputReport(event) {
  /*
    Handle input reports from the device.
    @param  {HIDInputReportEvent}  event  The input report event.
    */
  // Get the data from the report
  const data = new Uint8Array(event.data.buffer);

  // Find out if anything has changed since the last event
  const dataDiffPositions = [];
  const dataLength = data.length;

  for (let i = 0; i < dataLength; i++) {
    if (data[i] !== dataPrev[i]) {
      dataDiffPositions.push(i);
    }
  }

  if (dataDiffPositions.length === 0) {
    return;
  }

  // Reset memory
  let memory = clone(memoryPrev);
  const memoryCache = clone(memoryPrev);

  // Process the data
  memory = dataMap(dataDiffPositions, data, memory);

  // Figure out what changed
  const memoryDiff = {};
  let count = 0;

  for (let o in memoryCache) {
    for (let y in memory[o]) {
      if (memory[o][y] != memoryCache[o][y]) {
        if (!memoryDiff.hasOwnProperty(o)) {
          memoryDiff[o] = {};
        }

        // Create a custom event
        const eventName = o + "-" + y;
        const customEvent = new CustomEvent(eventName, {
          detail: memory[o][y],
        });
        eventEmitter.dispatchEvent(customEvent);

        memoryDiff[o][y] = memory[o][y];
        count = count + 1;
      }
    }
  }

  if (count > 0) {
    if (options.debug) {
      console.log(memoryDiff);
    }

    // Emit changes only
    const changesEvent = new CustomEvent("changes", { detail: memoryDiff });
    eventEmitter.dispatchEvent(changesEvent);
  }

  // Emit everything in all event
  const allEvent = new CustomEvent("all", { detail: memory });
  eventEmitter.dispatchEvent(allEvent);

  // Emit raw data
  const dataEvent = new CustomEvent("data", { detail: data });
  eventEmitter.dispatchEvent(dataEvent);

  // Set global variables for next event
  memoryPrev = memory;
  dataPrev = data;
} // handleInputReport

//---------
// Exports
//---------
export {
  connect,
  disconnect,
  on,
  once,
  leds,
  forceConstant,
  forceFriction,
  forceOff,
  relay,
  relayOS,
};
