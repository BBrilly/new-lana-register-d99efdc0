import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ripemd160 } from "https://esm.sh/hash.js@1.1.7";
import { schnorr, secp256k1 } from "https://esm.sh/@noble/curves@1.8.1/secp256k1";
import { bytesToHex as nobleToHex } from "https://esm.sh/@noble/hashes@1.7.1/utils";
import { sha256 } from "https://esm.sh/@noble/hashes@1.7.1/sha256";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// ===== BASE58 & CRYPTO UTILS =====
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  let x = BigInt('0x' + uint8ArrayToHex(bytes));
  let result = '';
  while(x > 0n){
    const remainder = Number(x % 58n);
    result = BASE58_ALPHABET[remainder] + result;
    x = x / 58n;
  }
  for(let i = 0; i < bytes.length && bytes[i] === 0; i++){
    result = '1' + result;
  }
  return result;
}

function base58Decode(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);
  let bytes = [0];
  for(let i = 0; i < str.length; i++){
    const c = str[i];
    const p = BASE58_ALPHABET.indexOf(c);
    if (p < 0) throw new Error('Invalid base58 character');
    let carry = p;
    for(let j = 0; j < bytes.length; j++){
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while(carry > 0){
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingOnes = 0;
  for(let i = 0; i < str.length && str[i] === '1'; i++){
    leadingOnes++;
  }
  const result = new Uint8Array(leadingOnes + bytes.length);
  bytes.reverse();
  result.set(bytes, leadingOnes);
  return result;
}

function base58CheckDecode(str: string): Uint8Array {
  const decoded = base58Decode(str);
  if (decoded.length < 4) throw new Error('Invalid base58check');
  const payload = decoded.slice(0, -4);
  return payload;
}

async function base58CheckEncode(payload: Uint8Array): Promise<string> {
  const hash1 = await crypto.subtle.digest('SHA-256', new Uint8Array(payload));
  const hash2 = await crypto.subtle.digest('SHA-256', hash1);
  const checksum = new Uint8Array(hash2).slice(0, 4);
  const withChecksum = new Uint8Array(payload.length + 4);
  withChecksum.set(payload);
  withChecksum.set(checksum, payload.length);
  return base58Encode(withChecksum);
}

async function sha256d(data: Uint8Array): Promise<Uint8Array> {
  const hash1 = await crypto.subtle.digest('SHA-256', new Uint8Array(data));
  const hash2 = await crypto.subtle.digest('SHA-256', hash1);
  return new Uint8Array(hash2);
}

function hexToUint8Array(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for(let i = 0; i < hex.length; i += 2){
    result[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return result;
}

function uint8ArrayToHex(array: Uint8Array): string {
  return Array.from(array).map((b)=>b.toString(16).padStart(2, '0')).join('');
}

function encodeVarint(n: number): Uint8Array {
  if (n < 0xfd) {
    return new Uint8Array([n]);
  } else if (n <= 0xffff) {
    const result = new Uint8Array(3);
    result[0] = 0xfd;
    result[1] = n & 0xff;
    result[2] = n >> 8 & 0xff;
    return result;
  } else {
    throw new Error('Varint too large');
  }
}

function pushData(data: Uint8Array): Uint8Array {
  const result = new Uint8Array(1 + data.length);
  result[0] = data.length;
  result.set(data, 1);
  return result;
}

// ===== ELLIPTIC CURVE =====
class Point {
  x: bigint;
  y: bigint;
  
  constructor(x: bigint, y: bigint){
    this.x = x;
    this.y = y;
  }
  
  static ZERO = new Point(0n, 0n);
  static P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
  static N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  static Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
  static Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;
  static G = new Point(Point.Gx, Point.Gy);
  
  static mod(a: bigint, m: bigint): bigint {
    const result = a % m;
    return result >= 0n ? result : result + m;
  }
  
  static modInverse(a: bigint, m: bigint): bigint {
    if (a === 0n) return 0n;
    let lm = 1n, hm = 0n;
    let low = Point.mod(a, m), high = m;
    while(low > 1n){
      const ratio = high / low;
      const nm = hm - lm * ratio;
      const nw = high - low * ratio;
      hm = lm;
      high = low;
      lm = nm;
      low = nw;
    }
    return Point.mod(lm, m);
  }
  
  add(other: Point): Point {
    if (this.x === 0n && this.y === 0n) return other;
    if (other.x === 0n && other.y === 0n) return this;
    if (this.x === other.x) {
      if (this.y === other.y) {
        const s = Point.mod(3n * this.x * this.x * Point.modInverse(2n * this.y, Point.P), Point.P);
        const x = Point.mod(s * s - 2n * this.x, Point.P);
        const y = Point.mod(s * (this.x - x) - this.y, Point.P);
        return new Point(x, y);
      } else {
        return Point.ZERO;
      }
    } else {
      const s = Point.mod((other.y - this.y) * Point.modInverse(other.x - this.x, Point.P), Point.P);
      const x = Point.mod(s * s - this.x - other.x, Point.P);
      const y = Point.mod(s * (this.x - x) - this.y, Point.P);
      return new Point(x, y);
    }
  }
  
  multiply(scalar: bigint): Point {
    if (scalar === 0n) return Point.ZERO;
    if (scalar === 1n) return this;
    let result: Point = Point.ZERO;
    let addend: Point = this;
    while(scalar > 0n){
      if (scalar & 1n) {
        result = result.add(addend);
      }
      addend = addend.add(addend);
      scalar >>= 1n;
    }
    return result;
  }
}

function privateKeyToUncompressedPublicKey(privateKeyHex: string): Uint8Array {
  const privateKeyBigInt = BigInt('0x' + privateKeyHex);
  const publicKeyPoint = Point.G.multiply(privateKeyBigInt);
  const x = publicKeyPoint.x.toString(16).padStart(64, '0');
  const y = publicKeyPoint.y.toString(16).padStart(64, '0');
  const result = new Uint8Array(65);
  result[0] = 0x04;
  result.set(hexToUint8Array(x), 1);
  result.set(hexToUint8Array(y), 33);
  return result;
}

function privateKeyToCompressedPublicKey(privateKeyHex: string): Uint8Array {
  const privateKeyBigInt = BigInt('0x' + privateKeyHex);
  const publicKeyPoint = Point.G.multiply(privateKeyBigInt);
  const x = publicKeyPoint.x.toString(16).padStart(64, '0');
  const prefix = publicKeyPoint.y % 2n === 0n ? 0x02 : 0x03;
  const result = new Uint8Array(33);
  result[0] = prefix;
  result.set(hexToUint8Array(x), 1);
  return result;
}

// Backward-compatible alias
function privateKeyToPublicKey(privateKeyHex: string): Uint8Array {
  return privateKeyToUncompressedPublicKey(privateKeyHex);
}

// Decode WIF and detect compression format
function decodeWifKey(wifStr: string): { privateKeyHex: string; isCompressed: boolean } {
  const normalized = wifStr.replace(/[\s\u200B-\u200D\uFEFF\r\n\t]/g, '').trim();
  const decoded = base58Decode(normalized);
  const payload = decoded.slice(0, -4);
  
  // Verify prefix — accept BOTH formats
  // 0xb0 (176) = old uncompressed (starts with '6')
  // 0x41 (65) = new compressed (starts with 'T')
  if (payload[0] !== 0xb0 && payload[0] !== 0x41) {
    throw new Error(`Invalid WIF prefix: 0x${payload[0].toString(16)}. Expected 0xb0 or 0x41`);
  }
  
  // 33 bytes = version(1) + key(32) → uncompressed
  // 34 bytes = version(1) + key(32) + flag(1) → compressed
  const isCompressed = payload.length === 34 && payload[33] === 0x01;
  const privateKeyHex = uint8ArrayToHex(payload.slice(1, 33));
  
  return { privateKeyHex, isCompressed };
}

async function publicKeyToAddress(publicKey: Uint8Array): Promise<string> {
  const sha256HashBuffer = await crypto.subtle.digest('SHA-256', new Uint8Array(publicKey));
  const sha256Hash = new Uint8Array(sha256HashBuffer);
  const hash160Array = ripemd160().update(Array.from(sha256Hash)).digest();
  const hash160 = new Uint8Array(hash160Array);
  const payload = new Uint8Array(21);
  payload[0] = 0x30;
  payload.set(hash160, 1);
  const address = await base58CheckEncode(payload);
  return address;
}

function encodeDER(r: bigint, s: bigint): Uint8Array {
  const rHex = r.toString(16).padStart(64, '0');
  const sHex = s.toString(16).padStart(64, '0');
  const rArray = Array.from(hexToUint8Array(rHex));
  const sArray = Array.from(hexToUint8Array(sHex));
  while(rArray.length > 1 && rArray[0] === 0) rArray.shift();
  while(sArray.length > 1 && sArray[0] === 0) sArray.shift();
  if (rArray[0] >= 0x80) rArray.unshift(0);
  if (sArray[0] >= 0x80) sArray.unshift(0);
  const der = [0x30, 0x00, 0x02, rArray.length, ...rArray, 0x02, sArray.length, ...sArray];
  der[1] = der.length - 2;
  return new Uint8Array(der);
}

function signECDSA(privateKeyHex: string, messageHash: Uint8Array): Uint8Array {
  const privateKeyBytes = hexToUint8Array(privateKeyHex);
  const signature = secp256k1.sign(messageHash, privateKeyBytes, { prehash: false, lowS: true });
  return signature.toDERRawBytes();
}

// ===== UTXO SELECTOR =====
class UTXOSelector {
  static MAX_INPUTS = 500;
  static DUST_THRESHOLD = 500000;
  static PREFERRED_INPUT_COUNT = 10;
  
  static selectUTXOs(utxos: any[], totalNeeded: number) {
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available for selection');
    }
    console.log(`🔍 UTXO Selection: Need ${totalNeeded} satoshis from ${utxos.length} UTXOs`);
    const totalAvailable = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    console.log(`💰 Total available: ${totalAvailable} satoshis (${(totalAvailable / 100000000).toFixed(8)} LANA)`);
    
    if (totalAvailable < totalNeeded) {
      throw new Error(
        `Insufficient total UTXO value: ${totalAvailable} < ${totalNeeded} satoshis. ` +
        `Available: ${(totalAvailable / 100000000).toFixed(8)} LANA, ` +
        `Needed: ${(totalNeeded / 100000000).toFixed(8)} LANA`
      );
    }
    
    const sortedUTXOs = [...utxos].sort((a, b) => b.value - a.value);
    const nonDustUtxos = sortedUTXOs.filter(u => u.value >= this.DUST_THRESHOLD);
    
    if (nonDustUtxos.length < sortedUTXOs.length) {
      console.log(`⚠️ Filtered out ${sortedUTXOs.length - nonDustUtxos.length} dust UTXOs`);
    }
    
    const workingSet = nonDustUtxos.length > 0 ? nonDustUtxos : sortedUTXOs;
    
    const selectedUTXOs = [];
    let totalSelected = 0;
    
    for (let i = 0; i < workingSet.length && selectedUTXOs.length < this.MAX_INPUTS; i++) {
      selectedUTXOs.push(workingSet[i]);
      totalSelected += workingSet[i].value;
      
      if (totalSelected >= totalNeeded) {
        console.log(`✅ Sufficient funds reached with ${selectedUTXOs.length} UTXOs`);
        return { selected: selectedUTXOs, totalValue: totalSelected };
      }
    }
    
    if (nonDustUtxos.length !== sortedUTXOs.length) {
      console.log('⚠️ Including dust UTXOs to meet target...');
      for (const utxo of sortedUTXOs) {
        if (selectedUTXOs.some(s => s.tx_hash === utxo.tx_hash && s.tx_pos === utxo.tx_pos)) continue;
        if (selectedUTXOs.length >= this.MAX_INPUTS) break;
        
        selectedUTXOs.push(utxo);
        totalSelected += utxo.value;
        
        if (totalSelected >= totalNeeded) {
          return { selected: selectedUTXOs, totalValue: totalSelected };
        }
      }
    }
    
    throw new Error(`Cannot build transaction: insufficient funds`);
  }
}

// ===== ELECTRUM CONNECTION =====
async function connectElectrum(servers: any[], maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    for (const server of servers) {
      try {
        console.log(`🔌 Connecting to ${server.host}:${server.port} (attempt ${attempt + 1})`);
        const conn = await Deno.connect({ hostname: server.host, port: server.port });
        console.log(`✅ Connected to ${server.host}:${server.port}`);
        return conn;
      } catch (error) {
        console.error(`❌ Failed to connect to ${server.host}:${server.port}`);
      }
    }
    if (attempt < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Failed to connect to any Electrum server');
}

async function electrumCall(method: string, params: any[], servers: any[], timeout = 30000) {
  let conn = null;
  try {
    conn = await connectElectrum(servers);
    const request = { id: Date.now(), method, params };
    const requestData = JSON.stringify(request) + '\n';
    console.log(`📤 Electrum ${method}:`, params);
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Electrum call timeout after ${timeout}ms`)), timeout);
    });
    
    const callPromise = (async () => {
      await conn.write(new TextEncoder().encode(requestData));
      let responseText = '';
      const buffer = new Uint8Array(8192);
      
      while (true) {
        const bytesRead = await conn.read(buffer);
        if (!bytesRead) break;
        const chunk = new TextDecoder().decode(buffer.slice(0, bytesRead));
        responseText += chunk;
        if (responseText.includes('\n')) break;
      }
      
      if (!responseText) throw new Error('No response from Electrum server');
      responseText = responseText.trim();
      
      const response = JSON.parse(responseText);
      if (response.error) throw new Error(`Electrum error: ${JSON.stringify(response.error)}`);
      return response.result;
    })();
    
    return await Promise.race([callPromise, timeoutPromise]);
  } finally {
    if (conn) {
      try { conn.close(); } catch (e) { /* ignore */ }
    }
  }
}

function parseScriptPubkeyFromRawTx(rawHex: string, voutIndex: number): Uint8Array {
  const tx = hexToUint8Array(rawHex);
  let cursor = 0;
  
  const readVarint = () => {
    const first = tx[cursor++];
    if (first < 0xfd) return first;
    if (first === 0xfd) {
      const value = tx[cursor] | tx[cursor + 1] << 8;
      cursor += 2;
      return value;
    }
    if (first === 0xfe) {
      const value = tx[cursor] | tx[cursor + 1] << 8 | tx[cursor + 2] << 16 | tx[cursor + 3] << 24;
      cursor += 4;
      return value;
    }
    throw new Error('Varint too large');
  };
  
  cursor += 4; // version
  cursor += 4; // nTime
  const vinCount = readVarint();
  
  for (let i = 0; i < vinCount; i++) {
    cursor += 32;
    cursor += 4;
    const scriptLen = readVarint();
    cursor += scriptLen;
    cursor += 4;
  }
  
  const voutCount = readVarint();
  if (voutIndex >= voutCount) {
    throw new Error(`vout index ${voutIndex} >= output count ${voutCount}`);
  }
  
  for (let i = 0; i < voutCount; i++) {
    cursor += 8;
    const scriptLen = readVarint();
    const script = tx.slice(cursor, cursor + scriptLen);
    if (i === voutIndex) {
      return script;
    }
    cursor += scriptLen;
  }
  
  throw new Error(`vout index ${voutIndex} not found`);
}

// ===== BUILD SIGNED TRANSACTION =====
async function buildSignedTx(
  selectedUTXOs: any[],
  privateKeyWIF: string,
  recipients: any[],
  fee: number,
  changeAddress: string,
  servers: any[]
) {
  console.log('🔧 Building multi-output transaction...');
  
  if (!selectedUTXOs || selectedUTXOs.length === 0) throw new Error('No UTXOs provided');
  if (recipients.length === 0) throw new Error('No recipients provided');
  
  const totalAmount = recipients.reduce((sum: number, r: any) => sum + r.amount, 0);
  const totalValue = selectedUTXOs.reduce((sum: number, utxo: any) => sum + utxo.value, 0);
  
  // Decode WIF and detect compression
  const { privateKeyHex, isCompressed } = decodeWifKey(privateKeyWIF);
  
  // Use the correct public key type based on WIF format
  const publicKey = isCompressed 
    ? privateKeyToCompressedPublicKey(privateKeyHex)
    : privateKeyToUncompressedPublicKey(privateKeyHex);
  
  console.log(`🔑 Using ${isCompressed ? 'compressed (33-byte)' : 'uncompressed (65-byte)'} public key`);
  
  const outputs = [];
  for (const recipient of recipients) {
    const recipientHash = base58CheckDecode(recipient.address).slice(1);
    const recipientScript = new Uint8Array([0x76, 0xa9, 0x14, ...recipientHash, 0x88, 0xac]);
    const recipientValueBytes = new Uint8Array(8);
    new DataView(recipientValueBytes.buffer).setBigUint64(0, BigInt(recipient.amount), true);
    const recipientOut = new Uint8Array([
      ...recipientValueBytes,
      ...encodeVarint(recipientScript.length),
      ...recipientScript
    ]);
    outputs.push(recipientOut);
  }
  
  const changeAmount = totalValue - totalAmount - fee;
  let outputCount = recipients.length;
  
  if (changeAmount > 1000) {
    const changeHash = base58CheckDecode(changeAddress).slice(1);
    const changeScript = new Uint8Array([0x76, 0xa9, 0x14, ...changeHash, 0x88, 0xac]);
    const changeValueBytes = new Uint8Array(8);
    new DataView(changeValueBytes.buffer).setBigUint64(0, BigInt(changeAmount), true);
    const changeOut = new Uint8Array([
      ...changeValueBytes,
      ...encodeVarint(changeScript.length),
      ...changeScript
    ]);
    outputs.push(changeOut);
    outputCount++;
  }
  
  const version = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
  const nTime = new Uint8Array(4);
  const timestamp = Math.floor(Date.now() / 1000);
  new DataView(nTime.buffer).setUint32(0, timestamp, true);
  const locktime = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
  const hashType = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
  
  const signedInputs = [];
  
  const scriptPubkeys: Uint8Array[] = [];
  for (let i = 0; i < selectedUTXOs.length; i++) {
    const utxo = selectedUTXOs[i];
    const rawTx = await electrumCall('blockchain.transaction.get', [utxo.tx_hash], servers);
    const scriptPubkey = parseScriptPubkeyFromRawTx(rawTx, utxo.tx_pos);
    scriptPubkeys.push(scriptPubkey);
  }
  
  for (let i = 0; i < selectedUTXOs.length; i++) {
    const utxo = selectedUTXOs[i];
    
    const preimageInputs: Uint8Array[] = [];
    for (let j = 0; j < selectedUTXOs.length; j++) {
      const uj = selectedUTXOs[j];
      const txidJ = hexToUint8Array(uj.tx_hash).reverse();
      const voutJ = new Uint8Array(4);
      new DataView(voutJ.buffer).setUint32(0, uj.tx_pos, true);
      const scriptForJ = (j === i) ? scriptPubkeys[j] : new Uint8Array(0);
      const inputJ = new Uint8Array([
        ...txidJ,
        ...voutJ,
        ...encodeVarint(scriptForJ.length),
        ...scriptForJ,
        0xff, 0xff, 0xff, 0xff
      ]);
      preimageInputs.push(inputJ);
    }
    
    const allPreimageInputs = preimageInputs.reduce((acc, cur) => {
      const out = new Uint8Array(acc.length + cur.length);
      out.set(acc);
      out.set(cur, acc.length);
      return out;
    }, new Uint8Array(0));
    
    const allOutputs = new Uint8Array(outputs.reduce((total, output) => total + output.length, 0));
    let offset = 0;
    for (const output of outputs) {
      allOutputs.set(output, offset);
      offset += output.length;
    }
    
    const preimage = new Uint8Array([
      ...version,
      ...nTime,
      ...encodeVarint(selectedUTXOs.length),
      ...allPreimageInputs,
      ...encodeVarint(outputCount),
      ...allOutputs,
      ...locktime,
      ...hashType
    ]);
    
    const sighash = await sha256d(preimage);
    const signature = signECDSA(privateKeyHex, sighash);
    const signatureWithHashType = new Uint8Array([...signature, 0x01]);
    const scriptSig = new Uint8Array([
      ...pushData(signatureWithHashType),
      ...pushData(publicKey)
    ]);
    
    const txid = hexToUint8Array(utxo.tx_hash).reverse();
    const voutBytes = new Uint8Array(4);
    new DataView(voutBytes.buffer).setUint32(0, utxo.tx_pos, true);
    
    const signedInput = new Uint8Array([
      ...txid,
      ...voutBytes,
      ...encodeVarint(scriptSig.length),
      ...scriptSig,
      0xff, 0xff, 0xff, 0xff
    ]);
    
    signedInputs.push(signedInput);
  }
  
  const allInputs = new Uint8Array(signedInputs.reduce((total, input) => total + input.length, 0));
  let offset = 0;
  for (const input of signedInputs) {
    allInputs.set(input, offset);
    offset += input.length;
  }
  
  const allOutputsData = new Uint8Array(outputs.reduce((total, output) => total + output.length, 0));
  offset = 0;
  for (const output of outputs) {
    allOutputsData.set(output, offset);
    offset += output.length;
  }
  
  const finalTx = new Uint8Array([
    ...version,
    ...nTime,
    ...encodeVarint(selectedUTXOs.length),
    ...allInputs,
    ...encodeVarint(outputCount),
    ...allOutputsData,
    ...locktime
  ]);
  
  return uint8ArrayToHex(finalTx);
}

// ===== NOSTR EVENT PUBLISHING =====
function nsecToHex(nsec: string): string {
  const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const data = nsec.slice(5);
  const values: number[] = [];
  for (const char of data) {
    const idx = BECH32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error('Invalid bech32 character');
    values.push(idx);
  }
  
  const bits: number[] = [];
  for (const v of values.slice(0, -6)) {
    for (let i = 4; i >= 0; i--) {
      bits.push((v >> i) & 1);
    }
  }
  
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bits[i + j];
    }
    bytes.push(byte);
  }
  
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

function serializeEvent(event: any): string {
  return JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ]);
}

async function createSignedNostrEvent(
  privateKeyHex: string,
  kind: number,
  content: string,
  tags: string[][]
): Promise<any> {
  const pubkeyBytes = schnorr.getPublicKey(privateKeyHex);
  const pubkey = nobleToHex(pubkeyBytes);
  
  const event = {
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind,
    tags,
    content
  };
  
  const serialized = serializeEvent(event);
  const eventHash = sha256(new TextEncoder().encode(serialized));
  const id = nobleToHex(eventHash);
  
  const sig = schnorr.sign(eventHash, privateKeyHex);
  
  return {
    ...event,
    id,
    sig: nobleToHex(sig)
  };
}

async function publishToRelays(event: any, relays: string[]): Promise<{ relay: string; success: boolean; error?: string }[]> {
  const results: { relay: string; success: boolean; error?: string }[] = [];
  
  for (const relay of relays) {
    try {
      console.log(`📡 Publishing to ${relay}...`);
      
      const ws = new WebSocket(relay);
      
      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        const timeout = setTimeout(() => {
          ws.close();
          resolve({ success: false, error: 'Timeout' });
        }, 10000);
        
        ws.onopen = () => {
          const message = JSON.stringify(['EVENT', event]);
          ws.send(message);
        };
        
        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data);
            if (data[0] === 'OK' && data[1] === event.id) {
              clearTimeout(timeout);
              ws.close();
              resolve({ success: data[2] === true, error: data[3] });
            }
          } catch (e) {
            // ignore parse errors
          }
        };
        
        ws.onerror = (e) => {
          clearTimeout(timeout);
          ws.close();
          resolve({ success: false, error: 'WebSocket error' });
        };
      });
      
      results.push({ relay, ...result });
      console.log(`${result.success ? '✅' : '❌'} ${relay}: ${result.success ? 'OK' : result.error}`);
    } catch (error) {
      results.push({ relay, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
  
  return results;
}

// ===== MAIN HANDLER =====
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    console.log('🚀 Starting return-lanas-and-send-KIND-87009 transaction...');
    
    const {
      sender_address,
      recipients,
      private_key,
      electrum_servers,
      relays,
      user_pubkey_hex,
      original_event_id,
      from_wallet,
      to_wallet,
      amount_lanoshis,
      memo,
      deduct_fee_from_amount
    } = await req.json();
    const shouldDeductFeeFromAmount = deduct_fee_from_amount === true;
    
    console.log('📋 Transaction parameters:', {
      sender_address,
      recipient_count: recipients?.length || 0,
      hasPrivateKey: !!private_key,
      user_pubkey_hex: user_pubkey_hex?.substring(0, 16) + '...',
      original_event_id: original_event_id?.substring(0, 16) + '...'
    });
    
    if (!sender_address || !recipients || !private_key || recipients.length === 0) {
      throw new Error('Missing required transaction parameters');
    }
    
    if (!user_pubkey_hex || !original_event_id || !from_wallet || !to_wallet || !amount_lanoshis) {
      throw new Error('Missing required Nostr event parameters');
    }
    
    // Validate private key matches sender address (supports both WIF formats)
    const { privateKeyHex, isCompressed } = decodeWifKey(private_key);
    
    // Generate both address types and check which one matches
    const uncompressedPubKey = privateKeyToUncompressedPublicKey(privateKeyHex);
    const compressedPubKey = privateKeyToCompressedPublicKey(privateKeyHex);
    const uncompressedAddress = await publicKeyToAddress(uncompressedPubKey);
    const compressedAddress = await publicKeyToAddress(compressedPubKey);
    
    const matchesCompressed = compressedAddress === sender_address;
    const matchesUncompressed = uncompressedAddress === sender_address;
    
    if (!matchesCompressed && !matchesUncompressed) {
      throw new Error(`Private key does not match sender address. Expected: ${sender_address}, got compressed: ${compressedAddress}, uncompressed: ${uncompressedAddress}`);
    }
    console.log(`✅ Private key validation passed (${matchesCompressed ? 'compressed' : 'uncompressed'} key match)`);
    
    const servers = electrum_servers && electrum_servers.length > 0
      ? electrum_servers
      : [
          { host: "electrum1.lanacoin.com", port: 5097 },
          { host: "electrum2.lanacoin.com", port: 5097 }
        ];
    
    // Convert recipients to satoshis
    let recipientsInSatoshis = recipients.map((recipient: any) => ({
      address: recipient.address,
      amount: typeof recipient.amount === 'number' && recipient.amount > 1000000
        ? Math.round(recipient.amount)
        : Math.round(recipient.amount * 100000000)
    }));
    
    let totalAmountSatoshis = recipientsInSatoshis.reduce((sum: number, r: any) => sum + r.amount, 0);
    const requestedAmountSatoshis = totalAmountSatoshis;
    
    // Get UTXOs
    const utxos = await electrumCall('blockchain.address.listunspent', [sender_address], servers);
    if (!utxos || utxos.length === 0) throw new Error('No UTXOs available');
    console.log(`📦 Found ${utxos.length} UTXOs`);
    const totalAvailableSatoshis = utxos.reduce((sum: number, utxo: any) => sum + utxo.value, 0);

    if (shouldDeductFeeFromAmount && totalAmountSatoshis > totalAvailableSatoshis) {
      recipientsInSatoshis = [{
        ...recipientsInSatoshis[0],
        amount: totalAvailableSatoshis
      }];
      totalAmountSatoshis = totalAvailableSatoshis;
    }
    
    // Select UTXOs
    let initialSelection = UTXOSelector.selectUTXOs(utxos, totalAmountSatoshis);
    let selectedUTXOs = initialSelection.selected;
    let totalSelected = initialSelection.totalValue;
    
    // Calculate fee
    const actualOutputCount = recipientsInSatoshis.length + 1;
    let baseFee = (selectedUTXOs.length * 180 + actualOutputCount * 34 + 10) * 100;
    let fee = Math.floor(baseFee * 1.5);
    
    // Iteratively add more UTXOs if needed
    let iterations = 0;
    while (totalSelected < totalAmountSatoshis + fee && selectedUTXOs.length < utxos.length && iterations < 10) {
      iterations++;
      const needed = totalAmountSatoshis + fee;
      if (shouldDeductFeeFromAmount && needed > totalAvailableSatoshis) break;
      const reSelection = UTXOSelector.selectUTXOs(utxos, needed);
      selectedUTXOs = reSelection.selected;
      totalSelected = reSelection.totalValue;
      baseFee = (selectedUTXOs.length * 180 + actualOutputCount * 34 + 10) * 100;
      fee = Math.floor(baseFee * 1.5);
    }
    
    if (totalSelected < totalAmountSatoshis + fee) {
      if (shouldDeductFeeFromAmount) {
        if (recipientsInSatoshis.length !== 1) {
          throw new Error('Fee deduction mode supports exactly one recipient');
        }

        // Spend the available selected UTXOs and subtract the real estimated fee
        // from the outgoing amount. This prevents frozen Lana8Wonder wallets from
        // failing when the client-side reserve is smaller than the UTXO-based fee.
        const spendableUTXOs = [...utxos]
          .sort((a: any, b: any) => b.value - a.value)
          .slice(0, UTXOSelector.MAX_INPUTS);
        selectedUTXOs = spendableUTXOs;
        totalSelected = selectedUTXOs.reduce((sum: number, utxo: any) => sum + utxo.value, 0);
        baseFee = (selectedUTXOs.length * 180 + recipientsInSatoshis.length * 34 + 10) * 100;
        fee = Math.floor(baseFee * 1.5);

        const adjustedAmount = totalSelected - fee;
        if (adjustedAmount <= UTXOSelector.DUST_THRESHOLD) {
          throw new Error(`Insufficient funds after fee: available ${(totalSelected / 100000000).toFixed(8)} LANA, fee ${(fee / 100000000).toFixed(8)} LANA`);
        }

        recipientsInSatoshis = [{
          ...recipientsInSatoshis[0],
          amount: adjustedAmount
        }];
        totalAmountSatoshis = adjustedAmount;
        console.log(`💸 Deducted fee from outgoing amount. Requested ${(requestedAmountSatoshis / 100000000).toFixed(8)} LANA, sending ${(totalAmountSatoshis / 100000000).toFixed(8)} LANA, fee ${(fee / 100000000).toFixed(8)} LANA`);
      } else {
      throw new Error(`Insufficient funds: available ${(totalSelected / 100000000).toFixed(8)} LANA, needed ${((totalAmountSatoshis + fee) / 100000000).toFixed(8)} LANA including fee`);
      }
    }
    
    // Build and sign transaction
    const signedTx = await buildSignedTx(selectedUTXOs, private_key, recipientsInSatoshis, fee, sender_address, servers);
    console.log('✍️ Transaction signed successfully');
    
    // Broadcast transaction
    console.log('🚀 Broadcasting transaction...');
    const broadcastResult = await electrumCall('blockchain.transaction.broadcast', [signedTx], servers, 45000);
    
    if (!broadcastResult) throw new Error('Transaction broadcast failed');
    
    let resultStr = typeof broadcastResult === 'string' ? broadcastResult : String(broadcastResult);
    
    if (
      resultStr.includes('TX rejected') ||
      resultStr.includes('code') ||
      resultStr.includes('-22') ||
      resultStr.includes('error') ||
      resultStr.includes('Error') ||
      resultStr.includes('failed') ||
      resultStr.includes('Failed')
    ) {
      throw new Error(`Transaction broadcast failed: ${resultStr}`);
    }
    
    const txid = resultStr.trim();
    if (!/^[a-fA-F0-9]{64}$/.test(txid)) {
      throw new Error(`Invalid transaction ID format: ${txid}`);
    }
    
    console.log('✅ Transaction broadcast successful:', txid);
    
    // ===== NOW PUBLISH KIND 87009 EVENT =====
    console.log('📡 Creating and publishing Kind 87009 event...');
    
    // Get registrar private key from Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data: registrarKeyData, error: registrarKeyError } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'nostr_registrar_nsec')
      .single();
    
    if (registrarKeyError || !registrarKeyData?.value) {
      console.error('❌ Failed to get registrar key:', registrarKeyError);
      // Still return success for TX, but note that event wasn't published
      return new Response(
        JSON.stringify({
          success: true,
          txid,
          total_amount: totalAmountSatoshis,
          fee,
          nostr_event_published: false,
          nostr_error: 'Failed to get registrar key'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const registrarNsec = registrarKeyData.value;
    const registrarPrivKeyHex = nsecToHex(registrarNsec);
    
    // Build Kind 87009 event tags
    const eventTags: string[][] = [
      ['p', user_pubkey_hex],
      ['e', original_event_id],
      ['from_wallet', from_wallet],
      ['to_wallet', to_wallet],
      ['tx', txid],
      ['amount_lanoshis', String(totalAmountSatoshis)]
    ];
    
    if (memo) {
      eventTags.push(['memo', memo]);
    }
    
    // Create and sign the event
    const nostrEvent = await createSignedNostrEvent(
      registrarPrivKeyHex,
      87009,
      'Unregistered LANA returned and verified.',
      eventTags
    );
    
    console.log('📝 Created Kind 87009 event:', nostrEvent.id);
    
    // Use provided relays or get from system parameters
    let relaysToUse = relays && relays.length > 0 ? relays : [];
    
    if (relaysToUse.length === 0) {
      const { data: sysParams } = await supabase
        .from('system_parameters')
        .select('relays')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (sysParams?.relays) {
        relaysToUse = Array.isArray(sysParams.relays) ? sysParams.relays : [];
      }
    }
    
    if (relaysToUse.length === 0) {
      relaysToUse = ['wss://relay.lanavault.space', 'wss://relay.lanacoin-eternity.com'];
    }
    
    console.log(`📡 Publishing to ${relaysToUse.length} relays...`);
    const publishResults = await publishToRelays(nostrEvent, relaysToUse);
    
    const successCount = publishResults.filter(r => r.success).length;
    console.log(`✅ Published to ${successCount}/${relaysToUse.length} relays`);
    
    return new Response(
      JSON.stringify({
        success: true,
        txid,
        total_amount: totalAmountSatoshis,
          requested_amount: requestedAmountSatoshis,
        fee,
          fee_deducted_from_amount: shouldDeductFeeFromAmount && totalAmountSatoshis < requestedAmountSatoshis,
        output_count: recipientsInSatoshis.length,
        nostr_event_published: successCount > 0,
        nostr_event_id: nostrEvent.id,
        relay_results: publishResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
