// Share links. A payload is deflated (where the browser supports it) and
// base64url-encoded into the URL fragment, so nothing ever leaves the device
// via a server — the data rides along inside the link itself.

const RAW_PREFIX = 'r'; // uncompressed JSON
const DEF_PREFIX = 'z'; // deflate-raw

function toBase64Url(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pipe(bytes, stream) {
  const blob = new Blob([bytes]);
  const piped = blob.stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

export async function encodePayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'function') {
    try {
      return DEF_PREFIX + toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
    } catch {
      // Fall through to the uncompressed form.
    }
  }
  return RAW_PREFIX + toBase64Url(bytes);
}

export async function decodePayload(code) {
  const prefix = code[0];
  const bytes = fromBase64Url(code.slice(1));
  let json;
  if (prefix === DEF_PREFIX) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser cannot open compressed share links. Ask for a file export instead.');
    }
    json = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')));
  } else if (prefix === RAW_PREFIX) {
    json = new TextDecoder().decode(bytes);
  } else {
    throw new Error('That share link is not in a format this app understands.');
  }
  return JSON.parse(json);
}

export async function buildShareUrl(payload, base = location.href) {
  const code = await encodePayload(payload);
  const url = new URL(base);
  url.hash = `#/import?d=${code}`;
  return url.toString();
}

/** Rough guard: links much past this get rejected by chat apps and browsers. */
export const MAX_SHARE_LENGTH = 8000;
