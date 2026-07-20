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

function createInkArchive(pointStride = 12, points = [{ x: 1, y: 2 }, { x: 3, y: 4 }]) {
  const pointData = Buffer.alloc(pointStride * points.length);
  points.forEach((point, index) => {
    const offset = index * pointStride;
    if (pointStride >= 4) pointData.writeFloatLE(point.x, offset);
    if (pointStride >= 8) pointData.writeFloatLE(point.y, offset + 4);
  });
  const strokeData = Buffer.concat([varintField(3, points.length), bytesField(7, pointData)]);
  const transform = Buffer.concat([floatField(5, 10), floatField(6, 20)]);
  const stroke = Buffer.concat([bytesField(5, strokeData), bytesField(7, transform)]);
  return Buffer.concat([Buffer.from([119, 114, 100, 0, 0, 0]), bytesField(5, stroke)]).toString("base64");
}

module.exports = { createInkArchive };
