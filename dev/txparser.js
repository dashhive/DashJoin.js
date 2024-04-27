'use strict';

let Tx = require('dashtx');

const OP_RETURN = 0x6a; // 106

/**
 * @param {String} txHex
 */
Tx.parseUnknown = function (txHex) {
	/**@type {Tx.TxInfo}*/
	//@ts-ignore
	let txInfo = {};
	try {
		void Tx._parse(txInfo, txHex);
	} catch (e) {
		/**@type {Error}*/
		//@ts-ignore - trust me bro, it's an error
		let err = e;
		let msg = err.message;
		let out = '';
		try {
			out = Tx._debugPrint(txInfo);
		} catch (e) {
			//@ts-ignore
			out = e.message;
		}
		Object.assign(err, {
			message: out,
			code: 'E_TX_PARSE',
			transaction: txInfo,
		});
		err.message += `\n${msg}`;
		throw err;
	}

	return txInfo;
};

/**
 * @param {Object<String, any>} tx
 * @param {String} hex
 */
Tx._parse = function (tx, hex) {
	/* jshint maxstatements: 200 */
	tx.hasInputScript = false;
	tx.totalSatoshis = 0;

	tx.offset = 0;

	let versionHex = hex.substr(tx.offset, 8);
	versionHex = Tx.utils.reverseHex(versionHex);
	let version = parseInt(versionHex, 16);
	tx.offset += 8;
	tx.version = version;
	tx.versionHex = versionHex;

	let [numInputs, numInputsSize] = parseVarIntHex(hex, tx.offset);
	tx.offset += numInputsSize;
	tx.numInputsHex = numInputs.toString(16);
	tx.numInputsHex = tx.numInputsHex.padStart(2, '0');
	tx.numInputs = numInputs;

	tx.inputs = [];
	for (let i = 0; i < numInputs; i += 1) {
		let input = {};
		tx.inputs.push(input);

		input.txidHex = hex.substr(tx.offset, 64);
		input.txid = input.txidHex;
		input.txid = Tx.utils.reverseHex(input.txid);
		input.txId = input.txid; // TODO
		tx.offset += 64;

		input.outputIndexHex = hex.substr(tx.offset, 8);
		let outputIndexHexLe = Tx.utils.reverseHex(input.outputIndexHex);
		input.outputIndex = parseInt(outputIndexHexLe, 16);
		tx.offset += 8;

		// TODO VarInt
		input.scriptSizeHex = hex.substr(tx.offset, 2);
		input.scriptSize = parseInt(input.scriptSizeHex, 16);
		tx.offset += 2;

		input.script = '';
		input.sigSizeHex = '';
		input.sigSize = 0;
		input.asn1Seq = '';
		input.asn1Bytes = '';
		input.rTypeHex = '';
		input.rSizeHex = '';
		input.rSize = 0;
		input.rValue = '';
		input.sTypeHex = '';
		input.sSizeHex = '';
		input.sSize = 0;
		input.sValue = '';
		input.sigHashTypeHex = '';
		input.sigHashType = 0;
		input.publicKeySizeHex = '';
		input.publicKeySize = 0;
		input.publicKey = '';
		if (0 === input.scriptSize) {
			// "Raw" Tx
		} else if (25 === input.scriptSize) {
			// "Hashable" Tx
			tx.hasInputScript = true;

			input.script = hex.substr(tx.offset, 2 * input.scriptSize);
			tx.offset += 2 * input.scriptSize;

			// console.info(
			//   "   ",
			//   script.slice(0, 4),
			//   "                 # (Hashable) Lock Script",
			// );
			// console.info("   ", script.slice(4, 6));
			// console.info("   ", script.slice(6, 26));
			// console.info("   ", script.slice(26, 46));
			// console.info("   ", script.slice(46, 50));
		} else if (input.scriptSize >= 106 && input.scriptSize <= 109) {
			tx.hasInputScript = true;

			input.script = hex.substr(tx.offset, 2 * input.scriptSize);
			tx.offset += 2 * input.scriptSize;

			input.sigSizeHex = input.script.substr(0, 2);
			input.sigSize = parseInt(input.sigSizeHex, 16);
			// console.info(
			//   `    ${input.sigSizeHex}                    # Signature Script Size (${input.sigSize})`,
			// );

			input.asn1Seq = input.script.substr(2, 2);
			input.asn1Bytes = input.script.substr(4, 2);
			// console.info(
			//   `    ${asn1Seq}${asn1Bytes}                  # ASN.1 ECDSA Signature`,
			// );

			input.rTypeHex = input.script.substr(6, 2);
			input.rSizeHex = input.script.substr(8, 2);
			input.rSize = parseInt(input.rSizeHex, 16);
			// console.info(`    ${input.rTypeHex}${input.rSizeHex}`);

			let sIndex = 10;
			input.rValue = input.script
				.substr(sIndex, 2 * input.rSize)
				.padStart(66, ' ');
			sIndex += 2 * input.rSize;
			// console.info(`    ${input.rValue}`);

			input.sTypeHex = input.script.substr(sIndex, 2);
			sIndex += 2;

			input.sSizeHex = input.script.substr(sIndex, 2);
			input.sSize = parseInt(input.sSizeHex, 16);
			sIndex += 2;
			// console.info(`    ${input.sTypeHex}${input.sSizeHex}`);

			input.sValue = input.script
				.substr(sIndex, 2 * input.sSize)
				.padStart(66, ' ');
			sIndex += 2 * input.sSize;
			// console.info(`    ${input.sValue}`);

			input.sigHashTypeHex = input.script.substr(sIndex, 2);
			input.sigHashType = parseInt(input.sigHashTypeHex, 16);
			sIndex += 2;
			// console.info(
			//   `    ${input.sigHashTypeHex}                    # Sig Hash Type (${input.sigHashType})`,
			// );

			input.publicKeySizeHex = input.script.substr(sIndex, 2);
			input.publicKeySize = parseInt(input.publicKeySizeHex, 16);
			sIndex += 2;
			// console.info(
			//   `    ${input.publicKeySizeHex}                    # Public Key Size (${input.publicKeySize})`,
			// );

			input.publicKey = input.script.substr(sIndex, 2 * input.publicKeySize);
			sIndex += 2 * input.publicKeySize;
			// console.info(`    ${input.publicKey}`);

			let rest = input.script.substr(sIndex);
			if (rest) {
				//@ts-ignore
				input.extra = rest;
				console.warn('spurious extra in script???');
				console.warn(rest);
			}

			// "Signed" Tx
		} else {
			throw new Error(
				`expected a "script" size of 0 (raw), 25 (hashable), or 106-109 (signed), but got '${input.scriptSize}'`,
			);
		}

		input.sequence = hex.substr(tx.offset, 8);
		tx.offset += 8;
		// console.info(`    ${input.sequence}              # Sequence (always 0xffffffff)`);
	}

	let [numOutputs, numOutputsSize] = parseVarIntHex(hex, tx.offset);
	tx.offset += numOutputsSize;
	tx.numOutputsHex = numOutputs.toString(16);
	tx.numOutputsHex = tx.numOutputsHex.padStart(2, '0');
	tx.numOutputs = numOutputs;

	tx.outputs = [];
	for (let i = 0; i < tx.numOutputs; i += 1) {
		let output = {};
		tx.outputs.push(output);

		output.satoshisHex = hex.substr(tx.offset, 16);
		tx.offset += 16;
		let satsHex = Tx.utils.reverseHex(output.satoshisHex);
		output.satoshis = parseInt(satsHex, 16);
		tx.totalSatoshis += output.satoshis;
		// console.info(
		//   `    ${output.satoshisHex}      # Satoshis (base units) (${output.satoshis})`,
		// );

		// TODO VarInt
		output.lockScriptSizeHex = hex.substr(tx.offset, 2);
		output.lockScriptSize = parseInt(output.lockScriptSizeHex, 16);
		// console.info(
		//   `    ${output.lockScriptSizeHex}                    # Lock Script Size (${output.lockScriptSize} bytes)`,
		// );
		tx.offset += 2;

		output.script = hex.substr(tx.offset, 2 * output.lockScriptSize);
		tx.offset += 2 * output.lockScriptSize;

		output.scriptTypeHex = output.script.slice(0, 2);
		output.scriptType = parseInt(output.scriptTypeHex, 16);
		output.memo = '';
		output.message = '';
		if (output.scriptType === OP_RETURN) {
			output.memo = output.script.slice(4, 2 * output.lockScriptSize);
			output.message = '';
			let decoder = new TextDecoder();
			let bytes = Tx.utils.hexToBytes(output.memo);
			try {
				output.message = decoder.decode(bytes);
			} catch (e) {
				output.message = '<non-UTF-8 bytes>';
			}
		} else {
			// TODO check the script type
			output.pubKeyHash = output.script.slice(6, -4);
		}
	}

	// TODO reverse
	let locktimeHex = hex.substr(tx.offset, 8);
	let locktime = parseInt(locktimeHex.slice(0, 2));
	tx.offset += 8;
	// console.info(`${locktimeHex}                  # LOCKTIME (${locktime})`);
	// console.info();

	let sigHashTypeHex = hex.substr(tx.offset);
	// if (sigHashTypeHex) {
	//   let sigHashType = parseInt(sigHashTypeHex.slice(0, 2));
	//   hex = hex.slice(0, -8);
	//   console.info(
	//     `${sigHashTypeHex}                  # SIGHASH_TYPE (0x${sigHashType})`,
	//   );
	//   console.info();

	//   let txHash = await Tx.hashPartial(hex, Tx.SIGHASH_ALL);
	//   let txHashHex = Tx.utils.bytesToHex(txHash);
	//   // TODO 'N/A' if not applicable
	//   console.info(`Tx Hash: ${txHashHex}`);
	//   console.info(`TxID:   N/A`);
	// } else if (hasInputScript) {
	//   console.info(`Tx Hash: N/A`);
	//   let txId = await Tx.getId(hex);
	//   console.info(`TxID: ${txId}`);
	// } else {
	//   console.info(`Tx Hash: N/A`);
	//   console.info(`TxID:   N/A`);
	// }

	let txBytes = hex.length / 2;
	// console.info(`Tx Bytes:       ${txBytes}`);
	// console.info();
	// console.info(`Tx Outputs:     ${totalSatoshis}`);
	// console.info(`Tx Fee:         ${txBytes}`);
	let txCost = txBytes + tx.totalSatoshis;
	// console.info(`Tx Min Cost:    ${txCost}`);
	// console.info();

	return { hex, txCost, sigHashTypeHex, locktime };
};

/**
 * @param {String} hex
 * @param {Number} offset
 */
function parseVarIntHex(hex, offset) {
	let size = 2;
	let numHex = hex.substr(offset, 2);
	let num = parseInt(numHex, 16);
	offset += size;

	if (num > 252) {
		if (253 === num) {
			numHex = hex.substr(offset, 4);
		} else if (254 === num) {
			numHex = hex.substr(offset, 8);
		} else if (255 === num) {
			numHex = hex.substr(offset, 16);
		}
		num = parseInt(numHex, 16);
		size += numHex.length;
	}

	return [num, size];
}

/**
 * @param {Object<String, any>} tx
 */
Tx._debugPrint = function (tx) {
	// version
	let lines = [
		'',
		`                                  # parsed to ${tx.offset}`,
		`${tx.versionHex}                  # VERSION (${tx.version})`,
	];
	lines.push('');

	// inputs
	lines.push(
		`${tx.numInputsHex}                        # Inputs (${tx.numInputs})`,
	);
	for (let i = 0; i < tx.inputs?.length; i += 1) {
		let count = i + 1;
		let input = tx.inputs[i];
		lines.push('');
		lines.push(`# Input ${count} of ${tx.numInputs}`);

		let txid1 = input.txidHex.slice(0, 16);
		let txid2 = input.txidHex.slice(16, 32);
		let txid3 = input.txidHex.slice(32, 48);
		let txid4 = input.txidHex.slice(48, 64);
		lines.push(`    ${txid1}      # Previous Output TX ID`);
		lines.push(`    ${txid2}`);
		lines.push(`    ${txid3}`);
		lines.push(`    ${txid4}`);

		lines.push(
			`    ${input.outputIndexHex}              # Previous Output index (${input.outputIndex})`,
		);

		lines.push(
			`    ${input.scriptSizeHex}                    # Script Size (${input.scriptSize} bytes)`,
		);
	}

	// outputs
	lines.push('');
	lines.push(
		`${tx.numOutputsHex}                        # Outputs (${tx.numOutputs})`,
	);
	for (let i = 0; i < tx.outputs?.length; i += 1) {
		let count = i + 1;
		let output = tx.outputs[i];

		lines.push('');
		lines.push(`# Output ${count} of ${tx.numOutputs}`);

		if (output.scriptType === OP_RETURN) {
			let todoWhatItIs = output.script.slice(2, 4);
			lines.push(
				`    ${output.scriptTypeHex} ${todoWhatItIs}                 # Memo (OP_RETURN)`,
			);
			let chars = output.message.split('');
			for (; chars.length; ) {
				let part = chars.splice(0, 20);
				let str = part.join('');
				lines.push(`    ${str}`);
			}
		} else {
			let script1 = output.script.slice(0, 4);
			let script2 = output.script.slice(4, 6);
			let script3 = output.script.slice(6, 26);
			let script4 = output.script.slice(26, 46);
			let script5 = output.script.slice(46, 50);
			lines.push(`    ${script1}                  # Script`);
			lines.push(`    ${script2}`);
			lines.push(`    ${script3}`);
			lines.push(`    ${script4}`);
			lines.push(`    ${script5}`);
		}
		lines.push('');
	}

	let output = lines.join('\n');
	return output;
};
