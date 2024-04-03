/** Double ended buffer combining vector and stream-like interfaces.
 *
 * >> and << read and write unformatted data using the above serialization templates.
 * Fills with data in linear time; some stringstream implementations take N^2 time.
 */
let Lib = {};
const ONLY_READY_TO_MIX = '';
const { MAX_MONEY } = require('./coin.js');
const CoinType = require('./cointype-constants.js');

const Vector = require('./vector.js');
module.exports = Lib;

function CDataStream(args = {}) {
	let self = this;
	this.vch = new Uint8Array();
	this.nReadPos = 0;
	this.nType = 0;
	this.nVersion = 0;

	this.Init = function (nTypeIn, nVersionIn) {
		self.nReadPos = 0;
		self.nType = nTypeIn;
		self.nVersion = nVersionIn;
	};

	this.read = function (pch, nSize) {
		if (nSize == 0) {
			return;
		}

		// Read from the beginning of the buffer
		let nReadPosNext = self.nReadPos + nSize;
		if (nReadPosNext > self.vch.size()) {
			throw new Error('CDataStream::read(): end of data');
		}
		//orig: memcpy(pch, &vch[nReadPos], nSize);
		for (let i = 0; i < nSize; i++) {
			self.vch[nReadPos + i] = pch[i];
		}
		if (nReadPosNext == self.vch.size()) {
			self.nReadPos = 0;
			self.vch = new Uint8Array();
			return;
		}
		self.nReadPos = nReadPosNext;
	};

	this.write = function (pch, nSize) {
		// Write to the end of the buffer
		for (let i = 0; i < nSize; i++) {
			self.vch[self.vch.length + i] = pch[i];
		}
	};

	/**
	 * XOR the contents of this stream with a certain key.
	 *
	 * @param[in] key    The key used to XOR the data in this stream.
	 */
	this.Xor = function (key) {
		if (key.size() == 0) {
			return;
		}

		for (let i = 0, j = 0; i != self.size(); i++) {
			self.vch[i] ^= key[j++];

			// This potentially acts on very many bytes of data, so it's
			// important that we calculate `j`, i.e. the `key` index in this
			// way instead of doing a %, which would effectively be a division
			// for each byte Xor'd -- much slower than need be.
			if (j == key.size()) {
				j = 0;
			}
		}
	};
}
