'use strict';

async function streamToBuffer(stream) {
  if (typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    const chunks = [];
    for (let result = await reader.read(); !result.done; result = await reader.read()) {
      chunks.push(Buffer.from(result.value));
    }
    return Buffer.concat(chunks);
  }
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

module.exports = { streamToBuffer };
