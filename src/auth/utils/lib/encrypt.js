import crypto from 'crypto';

const mima = `-----BEGIN PRIVATE KEY-----
MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBALuy37xfV9Inm0Bz
H9ecmnfZwjY7tbX2YG9HBM7aFVPnliH2MrMjjEF10FhOwBn6GZCAB0TGOXFvSGiM
99+xIkIT7yy/0obs1lcyJ6qzcW5TnfNbpnidm6Y0N54qNTbS1fZ4PeYlY2Exn1CX
MVwKfU1C8McT9hZJ3+CX9CyKCcoDAgMBAAECgYAmtQWUqCjJKufGS7d2VFI6gwqc
+oVHiA5tBD1Glwys5+Y7DLV54cvLuAsGGv9cnAnnla9qDGLONL++58s6MyI4GbSp
4yGu2vesjLX8CgnATTMGQ1RejB1Cp5XRyMhDDGDFD3vArniHSQMOmc3WDhczT1Tu
RIRC5UM736Jq3EcUeQJBAOZi/cFSmExtFaTCqlhVFQpJoce16Su+ufnsrey5xwNX
S72z97WiQ5q0j1wSrSB4hp7ni/q3HVgSg4zjyB40668CQQDQkPIZibmwyS/kI23g
rJXE1+sYbSmfcN0O40gBb3f7N1egLNkCTdIdXDlmrZCW6ma1dUOiCNQhZpnZaWjv
ZzftAkAXyA4jn5ADC5uZV1LYLWgvmKwvflKkZlqyNsE5V2/4o1E5MtOWFzrdRFgs
C+19FZPn4UTsy2wnBDo6F+U3YQUXAkEAt5ZfBUvOQGdX2KG3HoXMb7EAKEgu00It
0+UMhPbxzhgw8bWIcBbAVUfQ3yj4lV9PeXr3RbIvyBbgZhf7XoClIQJAGRJv6Bpa
y9WrfzpNBUEOd6yTt0YwvdlQYqvsbSIUIasf8xTpEr+TFMQBbYPtTTD52X0wJH4s
3SlxicLbHBaiKA==
-----END PRIVATE KEY-----`;

// 添加解密函数
export function decryptWithPrivateKey(encryptedData) {
  const privateKey = mima;
  const buffer = Buffer.from(encryptedData, 'base64');
  const decrypted = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING
    },
    buffer
  );
  return decrypted.toString('utf8');
}
