export function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlToBuffer(base64url) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buffer[i] = raw.charCodeAt(i);
  return buffer.buffer;
}

export function serializeRegistration(cred) {
  return {
    id: cred.id,
    rawId: bufferToBase64url(cred.rawId),
    type: cred.type,
    response: {
      attestationObject: bufferToBase64url(cred.response.attestationObject),
      clientDataJSON: bufferToBase64url(cred.response.clientDataJSON),
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}

export function serializeAssertion(cred) {
  return {
    id: cred.id,
    rawId: bufferToBase64url(cred.rawId),
    type: cred.type,
    response: {
      authenticatorData: bufferToBase64url(cred.response.authenticatorData),
      clientDataJSON: bufferToBase64url(cred.response.clientDataJSON),
      signature: bufferToBase64url(cred.response.signature),
      userHandle: cred.response.userHandle ? bufferToBase64url(cred.response.userHandle) : null,
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}
