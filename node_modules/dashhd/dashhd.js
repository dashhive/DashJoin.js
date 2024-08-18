/**
 * @typedef DashHD
 * @prop {HDCreate} create
 * @prop {HDDeriveChild} deriveChild - get the next child xkey (in a path segment)
 * @prop {HDDerivePath} derivePath - derive a full hd path from the given key
 * @prop {HDFingerprint} _fingerprint
 * @prop {HDFromSeed} fromSeed
 * @prop {HDFromXKey} fromXKey
 * @prop {HDToId} toId
 * @prop {HDToIdBytes} toIdBytes
 * @prop {HDToAddr} toAddr
 * @prop {HDToWif} toWif
 * @prop {HDToXPrv} toXPrv
 * @prop {HDToXKeyBytes} toXPrvBytes
 * @prop {HDToXPub} toXPub
 * @prop {HDToXKeyBytes} toXPubBytes
 * @prop {HDUtils} _utils
 * @prop {HDWipePrivates} wipePrivateData - randomizes private key buffer in-place
 * @prop {HDToPublic} toPublic - returns public key
 * @prop {Number} HARDENED_OFFSET - 0x80000000
 * @prop {HDVersions} MAINNET - 'xprv' & 'xpub'
 * @prop {HDVersions} TESTNET - 'tprv' & 'tpub'
 * @prop {true} HARDENED - for hardened derivation
 * @prop {false} PUBLIC - for public derivation
 * @prop {Number} RECEIVE - use 0 (external)
 * @prop {Number} CHANGE - use 1 (internal)
 * @prop {HDCreateAccountKey} _createAccount - helper
 * @prop {HDCreateXKey} _createXKey - helper
 * @prop {HDDeriveHelper} _derive - helper
 * @prop {HDToXBytes} _toXBytes - helper
 */

/**
 * @typedef HDUtils
 * @prop {HDKeyTweak} privateKeyTweakAdd
 * @prop {HDKeyTweak} publicKeyTweakAdd
 * @prop {HDKeyToKey} publicKeyNormalize
 * @prop {HDHasher} ripemd160sum
 * @prop {HDHasher} sha256sum
 * @prop {HDHasher} sha512hmac
 * @prop {HDBase64Url} bytesToBase64Url
 * @prop {HDKeyToKey} toPublicKey
 */

/**
 * @callback HDCreate
 * @param {HDKeyOptions} opts
 * @returns {HDKey}
 */

/**
 * @typedef HDKey
 * @prop {HDVersions} versions - magic bytes for base58 prefix
 * @prop {Number} depth - of hd path - typically 0 is seed, 1-3 hardened, 4-5 public
 * @prop {Number} parentFingerprint - 32-bit int, slice of id, stored in child xkeys
 * @prop {Number} index - the final segment of an HD Path, the index of the wif/addr
 * @prop {Uint8Array} chainCode - extra 32-bytes of shared entropy for xkeys
 * @prop {Uint8Array|undefined?} [privateKey]
 * @prop {Uint8Array} publicKey
 */

/**
 * @typedef HDKeyOptions
 * @prop {HDVersionsOption?} [versions]
 * @prop {Number?} [depth]
 * @prop {Number?} [parentFingerprint]
 * @prop {Number} index
 * @prop {Uint8Array} chainCode
 * @prop {Uint8Array?} [privateKey]
 * @prop {Uint8Array} publicKey

 */

/** @type {DashHD} */
//@ts-ignore
var DashHd = ("object" === typeof module && exports) || {};
(function (window, DashHd) {
  "use strict";

  //const BUFFER_LE = true;
  const BUFFER_BE = false;
  const COMPRESSED = true;

  const HARDENED = true;
  const PUBLIC = false;

  //@ts-ignore
  let Crypto = globalThis.crypto;

  //@ts-ignore
  /** @type {import('dashkeys').DashKeys} */
  //@ts-ignore
  let DashKeys = window.DashKeys || require("dashkeys");

  let Utils = {};

  /**
   * @param {String} base58key
   * @param {Object.<String, any>} [opts]
   */
  Utils.decode = async function (base58key, opts) {
    //@ts-ignore
    return await DashKeys.decode(base58key, opts);
  };

  /**
   * @param {Uint8Array} keyBytes
   * @param {Object} opts
   * @param {String|Uint32} [opts.version]
   */
  Utils.encodeXPrv = async function (keyBytes, opts) {
    let version = "xprv";
    if (opts?.version) {
      if (opts.version === "tprv") {
        version = opts.version;
      } else {
        // intended for numbers, but won't break hex strings
        version = opts.version.toString(16);
        version = version.padStart(8, "0");
      }
    }
    //@ts-ignore
    return await DashKeys.encodeKey(keyBytes, { version });
  };

  /**
   * @param {Uint8Array} keyBytes
   * @param {Object} opts
   * @param {String|Uint32} [opts.version]
   */
  Utils.encodeXPub = async function (keyBytes, opts) {
    let version = "xpub";
    if (opts?.version) {
      if (opts.version === "tpub") {
        version = opts.version;
      } else {
        // intended for numbers, but won't break hex strings
        version = opts.version.toString(16);
        version = version.padStart(8, "0");
      }
    }
    //@ts-ignore
    return await DashKeys.encodeKey(keyBytes, { version: version });
  };
  /** @type {HDKeyTweak} */
  Utils.privateKeyTweakAdd = async function (privateKeyCopy, tweak) {
    let Secp256k1 =
      //@ts-ignore
      window.nobleSecp256k1 || require("@dashincubator/secp256k1");
    let p = Secp256k1.utils._normalizePrivateKey(privateKeyCopy);
    let t = Secp256k1.utils._normalizePrivateKey(tweak);
    return Secp256k1.utils._bigintTo32Bytes(
      Secp256k1.utils.mod(p + t, Secp256k1.CURVE.n),
    );
  };

  /** @type {HDKeyToKey} */
  Utils.publicKeyNormalize = async function (pubBytes) {
    let Secp256k1 =
      //@ts-ignore
      window.nobleSecp256k1 || require("@dashincubator/secp256k1");

    try {
      let point = Secp256k1.Point.fromHex(pubBytes);
      pubBytes = point.toRawBytes(COMPRESSED);
    } catch (e) {
      throw new Error("Invalid public key");
    }

    return pubBytes;
  };

  /** @type {HDKeyTweak} */
  Utils.publicKeyTweakAdd = async function (publicKeyCopy, tweak) {
    let Secp256k1 =
      //@ts-ignore
      window.nobleSecp256k1 || require("@dashincubator/secp256k1");

    let P = Secp256k1.Point.fromHex(publicKeyCopy);
    let t = Secp256k1.utils._normalizePrivateKey(tweak);
    let Q = Secp256k1.Point.BASE.multiplyAndAddUnsafe(P, t, 1n);
    if (!Q) {
      throw new Error("Tweaked point at infinity");
    }
    return Q.toRawBytes(COMPRESSED);
  };

  /** @type {HDHasher} */
  Utils.ripemd160sum = async function (bytes) {
    //@ts-ignore
    return await DashKeys.utils.ripemd160sum(bytes);
  };

  /** @type {HDHasher} */
  Utils.sha256sum = async function (bytes) {
    let arrayBuffer = await Crypto.subtle.digest("SHA-256", bytes);
    let hashBytes = new Uint8Array(arrayBuffer);
    return hashBytes;
  };

  /** @type {HDHmac} */
  Utils.sha512hmac = async function (entropy, data) {
    /** @type {"raw"|"pkcs8"|"spki"} */
    let format = "raw";
    let algo = {
      name: "HMAC",
      hash: "SHA-512",
    };
    let extractable = false;
    /** @type {Array<KeyUsage>} */
    let keyUsages = ["sign"];
    let hmacKey = await Crypto.subtle.importKey(
      format,
      entropy,
      algo,
      extractable,
      keyUsages,
    );
    let sig = await Crypto.subtle.sign("HMAC", hmacKey, data);

    return new Uint8Array(sig);
  };

  /** @type {HDBase64Url} */
  Utils.bytesToBase64Url = function (bytes) {
    let bins = [];

    for (let i = 0; i < bytes.length; i += 1) {
      let b = bytes[i];
      let s = String.fromCodePoint(b);
      bins.push(s);
    }

    let str = bins.join("");
    let b64 = btoa(str);
    let b64url = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

    return b64url;
  };

  /** @type {HDSecureErase} */
  Utils.secureErase = function (buf) {
    Crypto.getRandomValues(buf);
  };

  /** @type {HDKeyToKey} */
  Utils.toPublicKey = async function (privBytes) {
    let Secp256k1 =
      //@ts-ignore
      window.nobleSecp256k1 || require("@dashincubator/secp256k1");

    return Secp256k1.getPublicKey(privBytes, COMPRESSED);
  };

  // "Bitcoin seed"
  let ROOT_CHAIN = Uint8Array.from([
    // B     i     t     c     o     i     n   " "     s     e     e     d
    0x42, 0x69, 0x74, 0x63, 0x6f, 0x69, 0x6e, 0x20, 0x73, 0x65, 0x65, 0x64,
  ]);
  let HARDENED_OFFSET = 0x80000000;
  let KEY_SIZE = 33;
  let INDEXED_KEY_SIZE = 4 + KEY_SIZE;
  let XKEY_SIZE = 74;
  let XKEY_DEPTH = 4; // m/44'/5'/0'/<0>[/0]

  //@ts-ignore
  DashHd._utils = Utils;

  // Bitcoin defaults hard-coded by default.
  // Use package `coininfo` for others.
  DashHd.MAINNET = { private: 0x0488ade4, public: 0x0488b21e };
  DashHd.TESTNET = { private: 0x043587cf, public: 0x04358394 };

  // Derivation types
  DashHd.HARDENED = HARDENED;
  DashHd.PUBLIC = PUBLIC;

  // Use types
  DashHd.RECEIVE = 0;
  DashHd.CHANGE = 1;

  DashHd.create = function ({
    versions,
    depth,
    parentFingerprint,
    index,
    chainCode,
    privateKey,
    publicKey,
  }) {
    /** @type {HDKey} */
    let hdkey = {};

    hdkey.versions = versions ?? DashHd.MAINNET;
    hdkey.depth = depth ?? 0;
    hdkey.parentFingerprint = parentFingerprint ?? 0;
    hdkey.index = index ?? 0;
    hdkey.chainCode = chainCode;
    hdkey.privateKey = privateKey;
    hdkey.publicKey = publicKey;

    return hdkey;
  };

  DashHd.toAddr = async function (pubBytes, opts) {
    if (pubBytes.length !== 33) {
      throw new Error("expected a public key (size 1 + 32)");
    }
    return await DashKeys.encodeKey(pubBytes, opts);
  };

  DashHd.toWif = async function (privBytes, opts) {
    if (privBytes.length !== 32) {
      throw new Error("expected a private key (size 32)");
    }
    return await DashKeys.encodeKey(privBytes, opts);
  };

  DashHd.toXPrv = async function (hdkey, opts) {
    //@ts-ignore - will throw if null
    let xprvBytes = DashHd._toXBytes(hdkey, hdkey.privateKey);
    //@ts-ignore - wth?
    let xprv = await Utils.encodeXPrv(xprvBytes, opts);
    return xprv;
  };

  // TODO - missing custom version
  DashHd.toXPrvBytes = function (hdkey, opts) {
    /** @type {Number} */
    //@ts-ignore
    let version = opts?.version || DashHd.MAINNET.private;

    //@ts-ignore - will throw if null
    let xprvPart = DashHd._toXBytes(hdkey, hdkey.privateKey);
    let xprvBytes = new Uint8Array(xprvPart.length + 4);
    let xkeyDv = new DataView(xprvBytes.buffer);
    xkeyDv.setUint32(0, version, BUFFER_BE);
    xprvBytes.set(xprvPart, 4);
    return xprvBytes;
  };

  DashHd.toXPub = async function (hdkey, opts) {
    let xpubBytes = DashHd._toXBytes(hdkey, hdkey.publicKey);
    let xpub = await Utils.encodeXPub(xpubBytes, opts);
    return xpub;
  };

  DashHd.toXPubBytes = function (hdkey, opts) {
    /** @type {Uint32} */
    //@ts-ignore - it's a number, I promise
    let version = DashHd.MAINNET.public;
    if (opts?.version) {
      let [_, versionUint32] = // jshint ignore:line
        _versionToTuple(
          opts.version,
          "xpub",
          //@ts-ignore - it's a number, I promise
          DashHd.MAINNET.public,
          "tpub",
          DashHd.TESTNET.public,
        );
      version = versionUint32;
    }

    let xpubPart = DashHd._toXBytes(hdkey, hdkey.publicKey);
    let xpubBytes = new Uint8Array(xpubPart.length + 4);
    let xkeyDv = new DataView(xpubBytes.buffer);
    xkeyDv.setUint32(0, version, BUFFER_BE);
    xpubBytes.set(xpubPart, 4);
    return xpubBytes;
  };

  DashHd._toXBytes = function (hdkey, keyBytes) {
    if (!keyBytes) {
      throw new Error("missing key bytes");
    }
    // version(4) is part of Base58Check (perhaps mistakenly)
    // depth(1) + fingerprint(4) + index(4) + chain(32) + key(1 + 32)
    let xkey = new Uint8Array(XKEY_SIZE);
    let xkeyDv = new DataView(xkey.buffer);

    xkeyDv.setUint8(0, hdkey.depth);

    let fingerprint = 0x00000000;
    if (hdkey.depth > 0) {
      fingerprint = hdkey.parentFingerprint;
    }
    xkeyDv.setUint32(1, fingerprint, BUFFER_BE);
    xkeyDv.setUint32(5, hdkey.index, BUFFER_BE);

    xkey.set(hdkey.chainCode, 9);

    let keyStart = 41;
    let isPrivate = 32 === keyBytes.length;
    if (isPrivate) {
      xkey[keyStart] = 0x00;
      keyStart += 1;
    }
    xkey.set(keyBytes, keyStart);

    return xkey;
  };

  // IMPORTANT: never allow `await` (or other async) between writing to
  // and accessing these! (otherwise the data will be corrupted)
  // (stored here for performance - no allocations or garbage collection)
  let _indexBuffer = new Uint8Array(4);
  let _indexDv = new DataView(_indexBuffer.buffer);

  DashHd.deriveChild = async function (hdkey, index, hardened = HARDENED) {
    // seed = indexedKey
    let indexedKey = new Uint8Array(INDEXED_KEY_SIZE);
    if (hardened) {
      if (!hdkey.privateKey) {
        throw new Error("Could not derive hardened child key");
      }
      index += HARDENED_OFFSET;
      indexedKey.set([0], 0);
      indexedKey.set(hdkey.privateKey, 1);
    } else {
      indexedKey.set(hdkey.publicKey, 0);
    }
    _indexDv.setUint32(0, index, BUFFER_BE);
    indexedKey.set(_indexBuffer, KEY_SIZE);

    let chainAndKeys;
    try {
      //@ts-ignore
      chainAndKeys = await DashHd._derive(indexedKey, hdkey);
    } catch (e) {
      // In essence:
      // if it couldn't produce a public key, just go on the next one
      //
      // More precisely:
      //
      // throw if IL >= n || (privateKey + IL) === 0
      // In case parse256(IL) >= n or ki == 0,
      // one should proceed with the next value for i

      // throw if IL >= n || (g**IL + publicKey) is infinity
      // In case parse256(IL) >= n or Ki is the point at infinity,
      // one should proceed with the next value for i
      //index += 1; // or not
      throw e;
    }

    let versions = hdkey.versions;
    let depth = hdkey.depth + 1;
    let parentFingerprint = await DashHd._fingerprint(hdkey.publicKey);
    return Object.assign(
      {
        versions,
        depth,
        parentFingerprint,
        index,
      },
      chainAndKeys,
    );
  };

  //@ts-ignore
  DashHd._derive = async function (indexedKey, xParent) {
    // seed = indexedKey
    // I = hash
    // IL = keyTweak
    // IR = nextChainCode
    let hash = await Utils.sha512hmac(xParent.chainCode, indexedKey);
    let keyTweak = hash.slice(0, 32);
    let hashedChainCode = hash.slice(32);

    let tweakedPrivKey;
    if (xParent.privateKey) {
      let priv = xParent.privateKey;
      tweakedPrivKey = await Utils.privateKeyTweakAdd(priv, keyTweak);
    }

    let pub = xParent.publicKey;
    let tweakedPubkey = await Utils.publicKeyTweakAdd(pub, keyTweak);

    return {
      chainCode: hashedChainCode,
      privateKey: tweakedPrivKey,
      publicKey: tweakedPubkey,
    };
  };

  DashHd.derivePath = async function (parent, path) {
    if (path === "m" || path === "M" || path === "m'" || path === "M'") {
      return parent;
    }

    let entries = path.split("/");
    let child = parent;
    for (let i = 0; i < entries.length; i += 1) {
      let c = entries[i];
      if (i === 0) {
        assert(/^[mM]{1}/.test(c), 'Path must start with "m" or "M"');
        continue;
      }

      let hardened = c.length > 1 && c[c.length - 1] === "'";
      let childIndex = parseInt(c, 10); // & (HARDENED_OFFSET - 1)
      assert(childIndex < HARDENED_OFFSET, "Invalid index");

      child = await DashHd.deriveChild(child, childIndex, hardened);
    }

    return child;
  };

  /** @type {HDFingerprint} */
  DashHd._fingerprint = async function (pubBytes) {
    if (!pubBytes) {
      throw new Error("Public key has not been set");
    }

    /*
     * Note: this *happens* to use the same algorithm
     * as many toPkh() implementations but, semantically,
     * this is NOT toPkh() - it has a different purpose.
     * Furthermore, fingerprint() may change independently of toPkh().
     */
    let sha = await Utils.sha256sum(pubBytes);
    let identifier = await Utils.ripemd160sum(sha);
    let i32be = readUInt32BE(identifier, 0);
    return i32be;
  };

  /**
   * @param {Uint8Array} u8 - a "web" JS buffer
   * @param {Number} offset - where to start reading
   * @returns {Number} - a 0-shifted (uint) JS Number
   */
  function readUInt32BE(u8, offset) {
    let dv = new DataView(u8.buffer);
    // will read offset + 4 bytes (32-bit uint)
    let n = dv.getUint32(offset, BUFFER_BE);
    return n;
  }

  DashHd.fromSeed = async function (seed, opts) {
    let purpose = opts?.purpose ?? 44;
    let coinType = opts?.coinType ?? 5;
    let versions = opts?.versions || DashHd.MAINNET;

    // I = hash
    // IL = rootPrivKey
    // IR = rootChainCode
    let hash = await Utils.sha512hmac(ROOT_CHAIN, seed);
    let rootPrivKey = hash.slice(0, 32);
    let rootChainCode = hash.slice(32);
    let rootPubkey = await Utils.toPublicKey(rootPrivKey);

    let chainAndKeys = {
      chainCode: rootChainCode,
      privateKey: rootPrivKey,
      publicKey: rootPubkey,
    };

    let hdkey = Object.assign(
      {
        versions: versions,
        depth: 0,
        parentFingerprint: 0,
        index: 0,
      },
      chainAndKeys,
      {
        deriveAccount,
      },
    );

    /** @type {HDDeriveAccount} */
    async function deriveAccount(account) {
      let hdpath = `m/${purpose}'/${coinType}'/${account}'`;
      let accountKey = await DashHd.derivePath(hdkey, hdpath);

      accountKey = await DashHd._createAccount(accountKey);
      return accountKey;
    }

    return hdkey;
  };

  /** @type {HDCreateAccountKey} */
  DashHd._createAccount = async function (accountKey) {
    Object.assign(accountKey, {
      deriveXKey,
    });

    async function deriveXKey(use = DashHd.RECEIVE) {
      let xkey = await DashHd.deriveChild(accountKey, use, PUBLIC);
      xkey = DashHd._createXKey(xkey);
      return xkey;
    }

    return accountKey;
  };

  /** @type {HDCreateXKey} */
  DashHd._createXKey = async function (xkey) {
    Object.assign(xkey, {
      deriveAddress,
    });

    /**
     * @param {Number} index - key index
     * @throws Error - if index cannot produce a valid public key
     */
    async function deriveAddress(index) {
      let key = await DashHd.deriveChild(xkey, index, PUBLIC);
      return key;
    }

    return xkey;
  };

  DashHd.fromXKey = async function (xkey, opts) {
    // version(4) + depth(1) + fingerprint(4) + index(4) + chain(32) + key(1 + 32)
    let versions = opts?.versions ?? DashHd.MAINNET;
    let normalizePublicKey = opts?.normalizePublicKey ?? false;
    let bip32 = opts?.bip32 ?? false;

    let keyInfo = await Utils.decode(xkey);
    let keyBytes = DashKeys.utils.hexToBytes(keyInfo.xprv || keyInfo.xpub);
    let keyDv = new DataView(keyBytes.buffer, 0, keyBytes.byteLength);

    //let version = keyDv.getUint32(0, BUFFER_BE);
    let version = parseInt(keyInfo.version, 16);

    let privateKey;
    let publicKey;
    let key = keyBytes.subarray(41);
    //if (keyDv.getUint8(41) === 0)
    if (key[0] === 0) {
      privateKey = key.subarray(1); // cut off first 0x0 byte
    } else {
      publicKey = key;
    }

    if (publicKey) {
      let [xpubHex, xpubUint32] = _versionToTuple(
        versions.public,
        "xpub",
        //@ts-ignore - it's a number, I promise
        DashHd.MAINNET.public,
        "tpub",
        DashHd.TESTNET.public,
      );
      assert(
        version === xpubUint32,
        `Version mismatch: version does not match ${xpubHex} (public)`,
      );
      // at one point xy pubs (1 + 64 bytes) were allowed (per spec)
      // but nothing in the ecosystem actually works that way
      assert(key.length === 33, "Public key must be 33 (1 + 32) bytes.");
      if (normalizePublicKey) {
        publicKey = await Utils.publicKeyNormalize(publicKey);
      }
    } else {
      let [xprvHex, xprvUint32] = _versionToTuple(
        versions.private,
        "xprv",
        //@ts-ignore - it's a number, I promise
        DashHd.MAINNET.private,
        "tprv",
        DashHd.TESTNET.private,
      );
      assert(
        version === xprvUint32,
        `Version mismatch: version does not match ${xprvHex} (private)`,
      );
      publicKey = await Utils.toPublicKey(privateKey);
    }

    let depth = keyDv.getUint8(0);
    if (!bip32) {
      if (depth !== XKEY_DEPTH) {
        throw new Error(
          `XKey with depth=${depth} does not represent an account (depth=${XKEY_DEPTH}), set { bip32: true } for xkeys with arbirtrary depths`,
        );
      }
    }

    let parentFingerprint = keyDv.getUint32(1, BUFFER_BE);
    let index = keyDv.getUint32(5, BUFFER_BE);
    let chainCode = keyBytes.subarray(9, 41);
    let hdkey = DashHd._createXKey({
      versions,
      depth,
      parentFingerprint,
      index,
      chainCode,
      privateKey,
      publicKey,
    });

    hdkey = DashHd._createXKey(hdkey);
    return hdkey;
  };

  /**
   *
   * @param {String|Number} version
   * @param {String} mainStr - 'xprv'|'xpub'
   * @param {Number} mainInt - DashHd.MAINNET.private|DashHd.MAINNET.public
   * @param {String} testStr - 'tprv'|'tpub'
   * @param {Number} testInt - DashHd.TESTNET.private|DashHd.TESTNET.publi c
   * @returns {[String, Number]}
   */
  function _versionToTuple(version, mainStr, mainInt, testInt, testStr) {
    let isMainnet = version === mainStr || version === "mainnet";
    let isTestnet = version === testStr || version === "testnet";
    if (isMainnet) {
      version = mainInt;
    } else if (isTestnet) {
      version = testInt;
    }
    // intended for uint32, but doesn't break hex
    let xkeyHex = version.toString(16);
    xkeyHex = xkeyHex.padStart(8, "0");
    let xkeyUint32 = parseInt(xkeyHex, 16);
    xkeyUint32 = xkeyUint32 >>> 0; /* jshint ignore:line */ // coerce uint32
    xkeyHex = `0x${xkeyHex}`;

    return [xkeyHex, xkeyUint32];
  }

  DashHd.toId = async function (hdkey) {
    let idBytes = await DashHd.toIdBytes(hdkey);
    let id = Utils.bytesToBase64Url(idBytes);

    return id;
  };

  DashHd.toIdBytes = async function (hdkey) {
    let xpubBytes = await DashHd.toXPubBytes(hdkey);

    let hashBuffer = await Crypto.subtle.digest("SHA-256", xpubBytes);
    let idBuffer = hashBuffer.slice(0, 8);
    let idBytes = new Uint8Array(idBuffer);

    return idBytes;
  };

  DashHd.toPublic = function (_hdkey) {
    let hdkey = Object.assign({}, _hdkey);
    hdkey.privateKey = null;
    return hdkey;
  };

  DashHd.wipePrivateData = function (hdkey) {
    if (hdkey.privateKey) {
      Utils.secureErase(hdkey.privateKey);
    }
    hdkey.privateKey = null;
    return hdkey;
  };

  DashHd.toPublic = function (_hdkey) {
    let hdkey = Object.assign({}, _hdkey);
    hdkey.privateKey = null;
    return hdkey;
  };

  /**
   * @param {Boolean} assertion
   * @param {String} message
   */
  function assert(assertion, message) {
    if (!assertion) {
      throw new Error(message);
    }
  }

  DashHd.HARDENED_OFFSET = HARDENED_OFFSET;

  // @ts-ignore
  window.DashHd = DashHd;
})(("object" === typeof window && window) || {}, DashHd);
if ("object" === typeof module) {
  module.exports = DashHd;
}

// Type Definitions

/**
 * @typedef {HDKey & HDAccountPartial} HDAccount
 */

/**
 * @typedef HDAccountPartial
 * @prop {HDDeriveXKey} deriveXKey
 */

/**
 * @typedef HDVersions
 * @prop {Uint32} private - 'mainnet', 'testnet', 'xprv' or 'tprv', or 4-byte hex or uint32
 * @prop {Uint32} public  - 'mainnet', 'testnet', 'xpub' or 'tpub', or 4-byte hex or uint32
 */

/**
 * @typedef HDVersionsOption
 * @prop {Uint32|String} [private] - 'mainnet', 'testnet', 'xprv' or 'tprv', or 4-byte hex or uint32
 * @prop {Uint32|String} [public]  - 'mainnet', 'testnet', 'xpub' or 'tpub', or 4-byte hex or uint32
 */

/**
 * @typedef {HDKey & HDXKeyPartial} HDXKey
 */

/**
 * @typedef HDXKeyPartial
 * @prop {HDDeriveAddress} deriveAddress
 */

/**
 * @typedef {HDKey & HDWalletPartial} HDWallet
 */

/**
 * @typedef HDWalletPartial
 * @prop {HDDeriveAccount} deriveAccount
 */

// Function Definitions

/**
 * @callback HDCreateAccountKey
 * @param {HDKey} walletKey
 * @returns HDAccount
 */

/**
 * @callback HDCreateXKey
 * @param {HDKey} accountKey
 * @returns HDXKey
 */

/**
 * @callback HDDeriveAccount
 * @param {Number} account
 * @returns {Promise<HDAccount>}
 * @throws Error - in the rare case the index can't produce a valid public key
 */

/**
 * @callback HDDeriveChild
 * @param {HDKey} hdkey
 * @param {Number} index - includes HARDENED_OFFSET, if applicable
 * @param {Boolean} hardened
 * returns {Promise<HDKey>}
 * @throws Error - in the rare case the index can't produce a valid public key
 */

/**
 * @callback HDDeriveHelper
 * @param {Uint8Array} indexedKey - (misnomer "seed") the parent key bytes + index bytes
 * @param {HDDeriveHelperOptions} xParent - the xKey parent (keys, chain code, etc)
 * returns {Promise<HDDeriveHelperOptions>}
 * @throws Error - in the rare case the index can't produce a valid public key
 */

/**
 * @typedef HDDeriveHelperOptions
 * @prop {Uint8Array} chainCode
 * @prop {Uint8Array|undefined?} [privateKey]
 * @prop {Uint8Array} publicKey
 */

/**
 * @callback HDDeriveAddress
 * @param {Number} index
 * @returns {Promise<HDKey>}
 * @throws Error - in the rare case the index can't produce a valid public key
 */

/**
 * @callback HDDerivePath
 * @param {HDKey} hdkey
 * @param {String} path
 * returns {Promise<HDKey>}
 * @throws Error - in the rare case the index can't produce a valid public key
 */

/**
 * @callback HDDeriveXKey
 * @param {Number} use - typically 0 (RECEIVE) or 1 (CHANGE)
 * @returns {Promise<HDXKey>}
 * @throws Error - in the rare case the index can't produce a valid public key
 */

/**
 * @callback HDFingerprint
 * @param {Uint8Array} pubBytes - Public Key
 * @returns {Promise<Number>}
 */

/**
 * @callback HDFromXKey
 * @param {String} xkey - Base58Check-encoded xprv or xpub
 * @param {HDFromXKeyOptions} [opts]
 * returns {Promise<HDXKey>}
 */

/**
 * @typedef HDFromXKeyOptions
 * @prop {HDVersionsOption} [versions]
 * @prop {Boolean} [bip32] - allow non-account depths
 * @prop {Boolean} [normalizePublicKey]
 * returns {Promise<HDKey>}
 */

/**
 * @callback HDFromSeed
 * @param {Uint8Array} seedBytes
 * @param {HDFromSeedOptions} [opts]
 * @returns {Promise<HDWallet>}
 */

/**
 * @typedef HDFromSeedOptions
 * @prop {Number} [purpose] - 44 (BIP-44) by default
 * @prop {Number} [coinType] - 5 (DASH) by default
 * @prop {HDVersionsOption} [versions] - mainnet ('xprv', 'xpub') by default
 */

/**
 * @callback HDGetBuffer
 * @returns {Uint8Array}
 */

/**
 * @callback HDToAddr
 * @param {Uint8Array} pubBytes
 * @param {HDToAddressOpts} [opts]
 * @returns {Promise<String>}
 */

/**
 * @callback HDToId
 * @param {HDKey} hdkey
 * @returns {Promise<String>}
 */

/**
 * @callback HDToIdBytes
 * @param {HDKey} hdkey
 * @returns {Promise<Uint8Array>}
 */

/**
 * @callback HDToXKeyBytes
 * @param {HDKey} hdkey
 * @param {HDToXKeyBytesOpts} [opts]
 * @returns {Uint8Array}
 */

/**
 * @typedef HDToXKeyBytesOpts
 * @prop {Number} [version]
 */

/**
 * @callback HDToXBytes
 * @param {HDKey} hdkey
 * @param {Uint8Array?} keyBytes
 * @returns {Uint8Array}
 */

/**
 * @callback HDToWif
 * @param {Uint8Array} privBytes
 * @param {HDToAddressOpts} [opts]
 * @returns {Promise<String>}
 */

/**
 * @typedef HDToAddressOpts
 * @prop {String} [version]
 */

/**
 * @callback HDToXPrv
 * @param {HDKey} hdkey
 * @param {Object} [opts]
 * @param {String|Uint32} [opts.version]
 * @returns {Promise<String>}
 */

/**
 * @callback HDToXPub
 * @param {HDKey} hdkey
 * @param {Object} [opts]
 * @param {String|Uint32} [opts.version]
 * @returns {Promise<String>}
 */

/**
 * @callback HDBase64Url
 * @param {Uint8Array} bytes
 * @returns {String} - URL-Safe Base64 Encoding
 */

/**
 * @callback HDHasher
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>} - hash Uint8Array
 */

/**
 * @callback HDHmac
 * @param {Uint8Array} entropy - secret, salt, or key
 * @param {Uint8Array} data - message
 * @returns {Promise<Uint8Array>} - hash Uint8Array
 */

/**
 * @callback HDKeyToKey
 * @param {Uint8Array} keyBytes - Key Uint8Array
 * @returns {Promise<Uint8Array>} - Public Key Uint8Array
 */

/**
 * @callback HDKeyTweak
 * @param {Uint8Array} keyBytes - Key Uint8Array
 * @param {Uint8Array} tweakBytes - Tweak Uint8Array
 * @returns {Promise<Uint8Array>} - Public Key Uint8Array
 */

/**
 * @callback HDSecureErase
 * @param {Uint8Array} buf
 * @returns {void}
 */

/**
 * @callback HDSetBuffer
 * @param {Uint8Array} buf
 */

/**
 * @callback HDToPublic
 * @param {HDKey} hdkey
 * @returns {HDKey}
 */

/**
 * @callback HDWipePrivates
 * @param {HDKey} hdkey
 */

/**
 * @typedef {Number} Uint32
 */
