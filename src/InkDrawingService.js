var __MN_INK_DRAWING_SERVICE_MNCardsToMDAddon = (function () {
  var BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function decodeBase64(value) {
    var input = String(value || "").replace(/^data:[^,]+,/, "").replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
    if (!input || input.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(input)) throw new Error("invalid-base64");

    var output = [];
    var buffer = 0;
    var bits = 0;
    for (var index = 0; index < input.length; index += 1) {
      var character = input.charAt(index);
      if (character === "=") break;
      var valueIndex = BASE64_CHARS.indexOf(character);
      if (valueIndex < 0) throw new Error("invalid-base64-character");
      buffer = (buffer << 6) | valueIndex;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        output.push((buffer >> bits) & 255);
      }
    }
    return new Uint8Array(output);
  }

  function readVarint(data, start) {
    var result = 0;
    var shift = 0;
    var position = start;
    while (position < data.length) {
      var byte = data[position++];
      result += (byte & 127) * Math.pow(2, shift);
      if ((byte & 128) === 0) return { value: result, position: position };
      shift += 7;
      if (shift > 49) throw new Error("varint-too-long");
    }
    throw new Error("truncated-varint");
  }

  function ensureAvailable(position, length, end, stage) {
    if (length < 0 || position + length > end) throw new Error("truncated-" + stage);
  }

  function parseFields(data) {
    var fields = [];
    var position = 0;
    var view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    while (position < data.length) {
      var tag = readVarint(data, position);
      position = tag.position;
      var fieldNumber = Math.floor(tag.value / 8);
      var wireType = tag.value & 7;
      if (!fieldNumber) throw new Error("invalid-field-number");
      var field = { field: fieldNumber, wireType: wireType };
      if (wireType === 0) {
        var varint = readVarint(data, position);
        field.value = varint.value;
        position = varint.position;
      } else if (wireType === 1) {
        ensureAvailable(position, 8, data.length, "fixed64");
        field.double = view.getFloat64(position, true);
        position += 8;
      } else if (wireType === 2) {
        var length = readVarint(data, position);
        position = length.position;
        ensureAvailable(position, length.value, data.length, "bytes");
        field.raw = data.slice(position, position + length.value);
        position += length.value;
      } else if (wireType === 5) {
        ensureAvailable(position, 4, data.length, "fixed32");
        field.float = view.getFloat32(position, true);
        position += 4;
      } else {
        throw new Error("unsupported-wire-type-" + wireType);
      }
      fields.push(field);
    }
    return fields;
  }

  function groupFields(fields) {
    var grouped = {};
    fields.forEach(function (field) {
      if (!grouped[field.field]) grouped[field.field] = [];
      grouped[field.field].push(field);
    });
    return grouped;
  }

  function firstField(grouped, number) {
    return grouped[number] && grouped[number][0] ? grouped[number][0] : null;
  }

  function decodePoints(raw, declaredPointCount) {
    var view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    var pointCount = Number(declaredPointCount) > 0 ? Math.floor(Number(declaredPointCount)) : Math.floor(raw.length / 12);
    var pointStride = pointCount > 0 ? Math.floor(raw.length / pointCount) : 12;
    if (pointStride < 12) throw new Error("invalid-point-stride");
    var points = [];
    for (var index = 0; index < pointCount; index += 1) {
      var offset = index * pointStride;
      if (offset + 12 > raw.length) break;
      points.push({ x: view.getFloat32(offset, true), y: view.getFloat32(offset + 4, true) });
    }
    return points;
  }

  function floatValue(grouped, number, defaultValue) {
    var field = firstField(grouped, number);
    return field && Number.isFinite(field.float) ? field.float : defaultValue;
  }

  function decodeStroke(raw) {
    var grouped = groupFields(parseFields(raw));
    var strokeDataField = firstField(grouped, 5);
    var points = [];
    if (strokeDataField && strokeDataField.raw) {
      var strokeData = groupFields(parseFields(strokeDataField.raw));
      var pointCountField = firstField(strokeData, 3);
      var pointsField = firstField(strokeData, 7);
      if (pointsField && pointsField.raw) points = decodePoints(pointsField.raw, pointCountField ? pointCountField.value : 0);
    }
    var transformField = firstField(grouped, 7);
    var transform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    if (transformField && transformField.raw) {
      var transformFields = groupFields(parseFields(transformField.raw));
      transform = {
        a: floatValue(transformFields, 1, 1), b: floatValue(transformFields, 2, 0),
        c: floatValue(transformFields, 3, 0), d: floatValue(transformFields, 4, 1),
        tx: floatValue(transformFields, 5, 0), ty: floatValue(transformFields, 6, 0),
      };
    }
    return points.map(function (point) {
      return { x: transform.a * point.x + transform.c * point.y + transform.tx, y: transform.b * point.x + transform.d * point.y + transform.ty };
    });
  }

  function decodeInkData(data) {
    if (data.length < 6) throw new Error("truncated-header");
    if (data[0] !== 119 || data[1] !== 114 || data[2] !== 100) throw new Error("invalid-magic-header");
    var grouped = groupFields(parseFields(data.slice(6)));
    var strokes = (grouped[5] || []).map(function (field) {
      return field.raw ? decodeStroke(field.raw) : [];
    }).filter(function (points) {
      return points.length > 0;
    });
    if (strokes.length === 0) throw new Error("no-valid-strokes");
    return strokes;
  }

  function computeBounds(strokes) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    strokes.forEach(function (points) {
      points.forEach(function (point) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
    });
    if (!Number.isFinite(minX)) throw new Error("no-valid-bounds");
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function formatNumber(value) {
    return Number(value).toFixed(2);
  }

  function renderSvg(strokes, bounds) {
    var margin = 30;
    var width = Math.max(1, bounds.width + margin * 2);
    var height = Math.max(1, bounds.height + margin * 2);
    var minX = bounds.x - margin;
    var minY = bounds.y - margin;
    var parts = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + width.toFixed(1) + '" height="' + height.toFixed(1) + '" viewBox="' + minX.toFixed(1) + " " + minY.toFixed(1) + " " + width.toFixed(1) + " " + height.toFixed(1) + '">',
      '<rect x="' + minX.toFixed(1) + '" y="' + minY.toFixed(1) + '" width="' + width.toFixed(1) + '" height="' + height.toFixed(1) + '" fill="white"/>',
    ];
    strokes.forEach(function (points) {
      if (points.length === 1) {
        parts.push('<circle cx="' + formatNumber(points[0].x) + '" cy="' + formatNumber(points[0].y) + '" r="1.5" fill="#1d1d1f"/>');
        return;
      }
      var path = "M " + formatNumber(points[0].x) + " " + formatNumber(points[0].y);
      for (var index = 1; index < points.length; index += 1) path += " L " + formatNumber(points[index].x) + " " + formatNumber(points[index].y);
      parts.push('<path d="' + path + '" fill="none" stroke="#1d1d1f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>');
    });
    parts.push("</svg>");
    return parts.join("\n");
  }

  function renderDrawingSvg(base64) {
    var strokes = decodeInkData(decodeBase64(base64));
    var bounds = computeBounds(strokes);
    return { svg: renderSvg(strokes, bounds), strokeCount: strokes.length, bounds: bounds };
  }

  return { renderDrawingSvg: renderDrawingSvg };
})();
