const { Buffer } = require("node:buffer");

function encodeVarint(value) {
  const bytes = [];
  let current = value;
  do {
    let byte = current & 0x7f;
    current = Math.floor(current / 128);
    if (current > 0) byte |= 0x80;
    bytes.push(byte);
  } while (current > 0);
  return Buffer.from(bytes);
}

function bytesField(number, payload) {
  return Buffer.concat([encodeVarint(number * 8 + 2), encodeVarint(payload.length), payload]);
}

function varintField(number, value) {
  return Buffer.concat([encodeVarint(number * 8), encodeVarint(value)]);
}

function floatField(number, value) {
  const payload = Buffer.alloc(4);
  payload.writeFloatLE(value);
  return Buffer.concat([encodeVarint(number * 8 + 5), payload]);
}

function createInkArchive() {
  const pointData = Buffer.alloc(24);
  pointData.writeFloatLE(1, 0);
  pointData.writeFloatLE(2, 4);
  pointData.writeFloatLE(3, 12);
  pointData.writeFloatLE(4, 16);
  const strokeData = Buffer.concat([varintField(3, 2), bytesField(7, pointData)]);
  const transform = Buffer.concat([floatField(5, 10), floatField(6, 20)]);
  const stroke = Buffer.concat([bytesField(5, strokeData), bytesField(7, transform)]);
  return Buffer.concat([Buffer.from([119, 114, 100, 0, 0, 0]), bytesField(5, stroke)]).toString("base64");
}

module.exports = { createInkArchive };
