(function () {
	'use strict';

	function $(sel, el) {
		return (el || document).querySelector(sel);
	}

	function $$(sel, el) {
		return Array.from((el || document).querySelectorAll(sel));
	}

	let DashPhrase = window.DashPhrase;
	let DashHd = window.DashHd;
	let DashKeys = window.DashKeys;
	let DashTx = window.DashTx;
	let Secp256k1 = window.nobleSecp256k1;

	const SATS = 100000000;
	const MIN_BALANCE = 100001 * 1000;

	let network = 'testnet';
	let rpcBaseUrl = 'https://trpc.digitalcash.dev/';
	let rpcBasicAuth = btoa(`api:null`);

	let addresses = [];
	let changeAddrs = [];
	let receiveAddrs = [];
	let spentAddrs = [];
	let deltasMap = {};
	let keysMap = {};

	let keyUtils = {
		getPrivateKey: async function (txInput, i) {
			// let address;
			let address = txInput.address;
			if (!address) {
				let pkhBytes = DashKeys.utils.hexToBytes(txInput.pubKeyHash);
				address = await DashKeys.pkhToAddr(pkhBytes, { version: network });
			}

			let yourKeyData = keysMap[address];

			let privKeyBytes = await DashKeys.wifToPrivKey(yourKeyData.wif, {
				version: network,
			});
			return privKeyBytes;
		},

		getPublicKey: async function (txInput, i) {
			let privKeyBytes = await keyUtils.getPrivateKey(txInput, i);
			let pubKeyBytes = await keyUtils.toPublicKey(privKeyBytes);

			return pubKeyBytes;
		},
		// TODO
		// toPkh: DashKeys.pubkeyToPkh,

		sign: async function (privKeyBytes, txHashBytes) {
			let sigOpts = { canonical: true, extraEntropy: true };
			let sigBytes = await Secp256k1.sign(txHashBytes, privKeyBytes, sigOpts);

			return sigBytes;
		},

		toPublicKey: async function (privKeyBytes) {
			let isCompressed = true;
			let pubKeyBytes = Secp256k1.getPublicKey(privKeyBytes, isCompressed);

			return pubKeyBytes;
		},
	};
	let dashTx = DashTx.create(keyUtils);

	async function rpc(method, ...params) {
		// typically http://localhost:19998/
		let payload = JSON.stringify({ method, params });
		let resp = await fetch(rpcBaseUrl, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${rpcBasicAuth}`,
				'Content-Type': 'application/json',
			},
			body: payload,
		});

		let data = await resp.json();
		if (data.error) {
			let err = new Error(data.error.message);
			Object.assign(err, data.error);
			throw err;
		}

		return data.result;
	}

	function dbGet(key, defVal) {
		let dataJson = localStorage.getItem(key);
		if (!dataJson) {
			dataJson = JSON.stringify(defVal);
		}

		let data;
		try {
			data = JSON.parse(dataJson);
		} catch (e) {
			data = defVal;
		}
		return data;
	}

	function dbSet(key, val) {
		if (val === null) {
			localStorage.removeItem(key);
			return;
		}

		let dataJson = JSON.stringify(val);
		localStorage.setItem(key, dataJson);
	}

	function removeElement(arr, val) {
		let index = arr.indexOf(val);
		if (index !== -1) {
			arr.splice(index, 1);
		}
	}

	window.toggleAll = function (event) {
		let checked = event.target.checked;

		let $table = event.target.closest('table');
		for (let $input of $$('[type=checkbox]', $table)) {
			$input.checked = checked;
		}
		return true;
	};

	window.setMax = function (event) {
		let totalSats = 0;
		let addrs = Object.keys(deltasMap);
		let fee = 100;
		for (let addr of addrs) {
			let info = deltasMap[addr];
			if (info.balance === 0) {
				continue;
			}
			for (let delta of info.deltas) {
				totalSats += delta.satoshis;
				fee += 100;
			}
		}

		totalSats -= fee;
		const FOUR_ZEROS = 10000;
		let sigDigits = Math.floor(totalSats / FOUR_ZEROS);
		let totalSigSats = sigDigits * FOUR_ZEROS;
		let totalAmount = totalSigSats / SATS;
		let dust = totalSats - totalSigSats;
		dust += fee;

		$('[data-id=send-amount]').value = totalAmount.toFixed(4);
		//$('[data-id=send-dust]').value = dust;
		$('[data-id=send-dust]').textContent = dust;
	};

	window.sendDash = async function (event) {
		event.preventDefault();

		let amountStr = $('[data-id=send-amount]').value || 0;
		let amount = parseFloat(amountStr);
		let satoshis = Math.round(amount * SATS);
		// if (satoshis === 0) {
		//     satoshis = null;
		// }

		let address = $('[data-id=send-address]').value;
		if (!address) {
			let err = new Error(`missing payment 'address' to send funds to`);
			window.alert(err.message);
			throw err;
		}

		let balance = 0;

		/** @type {Array<DashTx.TxInput>?} */
		let inputs = null;
		/** @type {Array<DashTx.TxInput>?} */
		let utxos = null;

		let $coins = $$('[data-name=coin]:checked');
		if ($coins.length) {
			inputs = [];
			for (let $coin of $coins) {
				let [address, txid, indexStr] = $coin.value.split(',');
				let index = parseInt(indexStr, 10);
				let coin = selectCoin(address, txid, index);
				balance += coin.satoshis;
				Object.assign(coin, { outputIndex: coin.index });
				inputs.push(coin);
			}
		} else {
			utxos = [];
			let spendables = Object.keys(deltasMap);
			for (let address of spendables) {
				let info = deltasMap[address];
				if (info.balance === 0) {
					continue;
				}
				for (let coin of info.deltas) {
					balance += coin.satoshis;
					Object.assign(coin, { outputIndex: coin.index });
					utxos.push(coin);
				}
			}
		}

		if (balance < satoshis) {
			// there's a helper for this in DashTx, including fee calc,
			// but this is quick-n-dirty just to get an alert rather than
			// checking error types and translating cthe error message
			let available = balance / SATS;
			let availableStr = available.toFixed(4);
			let err = new Error(
				`requested to send '${amountStr}' when only '${availableStr}' is available`,
			);
			window.alert(err.message);
			throw err;
		}

		console.log('DEBUG Payment Address:', address);
		console.log('DEBUG Available coins:', utxos?.length || inputs?.length);
		console.log('DEBUG Available balance:', balance);
		console.log('DEBUG Amount:', amount);

		let output = { satoshis, address };
		let draftTx = dashTx.legacy.draftSingleOutput({ utxos, inputs, output });
		console.log('DEBUG draftTx', draftTx);

		let changeOutput = draftTx.outputs[1];
		if (changeOutput) {
			let address = changeAddrs.shift();
			changeOutput.address = address;
		}

		// See https://github.com/dashhive/DashTx.js/pull/77
		for (let input of draftTx.inputs) {
			let addressInfo = keysMap[input.address];
			Object.assign(input, {
				publicKey: addressInfo.publicKey,
				pubKeyHash: addressInfo.pubKeyHash,
			});
		}
		for (let output of draftTx.outputs) {
			if (output.pubKeyHash) {
				continue;
			}
			if (!output.address) {
				let err = new Error(`output is missing 'address' and 'pubKeyHash'`);
				window.alert(err.message);
				throw err;
			}
			let pkhBytes = await DashKeys.addrToPkh(output.address, {
				version: network,
			});
			Object.assign(output, {
				pubKeyHash: DashKeys.utils.bytesToHex(pkhBytes),
			});
		}

		draftTx.inputs.sort(DashTx.sortInputs);
		draftTx.outputs.sort(DashTx.sortOutputs);
		amount = output.satoshis / SATS;

		$('[data-id=send-dust]').textContent = draftTx.feeTarget;
		$('[data-id=send-amount]').textContent = amount.toFixed(8);

		let tx = await dashTx.legacy.finalizePresorted(draftTx);
		console.log('DEBUG signed tx', tx);
		{
			let amountStr = amount.toFixed(4);
			let confirmed = window.confirm(`Really send ${amountStr} to ${address}?`);
			if (!confirmed) {
				return;
			}
		}
		void (await rpc('sendrawtransaction', tx.transaction));

		let updatedAddrs = [];
		for (let input of tx.inputs) {
			updatedAddrs.push(input.address);
			let knownSpent = spentAddrs.includes(input.address);
			if (!knownSpent) {
				spentAddrs.push(input.address);
			}
			removeElement(addresses, input.address);
			removeElement(receiveAddrs, input.address);
			removeElement(changeAddrs, input.address);
			delete deltasMap[input.address];
			dbSet(input.address, null);
		}
		for (let output of tx.outputs) {
			updatedAddrs.push(output.address);
			removeElement(addresses, output.address);
			removeElement(receiveAddrs, output.address);
			removeElement(changeAddrs, output.address);
			delete deltasMap[output.address];
			dbSet(output.address, null);
		}

		await updateDeltas(updatedAddrs);
		renderAddresses();
		renderCoins();
	};

	function renderAddresses() {
		$('[data-id=spent-count]').textContent = spentAddrs.length;
		$('[data-id=spent]').textContent = spentAddrs.join('\n');
		$('[data-id=receive-addresses]').textContent = receiveAddrs.join('\n');
		$('[data-id=change-addresses]').textContent = changeAddrs.join('\n');
	}

	function selectCoin(address, txid, index) {
		let info = deltasMap[address];
		if (!info) {
			let err = new Error(`coins for '${address}' disappeared`);
			window.alert(err.message);
			throw err;
		}
		for (let delta of info.deltas) {
			if (delta.txid !== txid) {
				continue;
			}
			if (delta.index !== index) {
				continue;
			}
			return delta;
		}
	}

	async function init() {
		let phrases = dbGet('wallet-phrases', []);
		let primaryPhrase = phrases[0];
		if (!primaryPhrase) {
			primaryPhrase = await DashPhrase.generate(128);
			dbSet('wallet-phrases', [primaryPhrase]);
		}

		let primarySalt = '';
		let primarySeedBytes = await DashPhrase.toSeed(primaryPhrase, primarySalt);
		let primarySeedHex = DashKeys.utils.bytesToHex(primarySeedBytes);
		$('[data-id=wallet-phrase]').value = primaryPhrase;
		$('[data-id=wallet-seed]').innerText = primarySeedHex;

		let accountIndex = 0;
		let coinType = 5; // DASH
		let versions = DashHd.MAINNET;
		if (network === `testnet`) {
			coinType = 1; // testnet (for all coins)
			versions = DashHd.TESTNET;
		}
		$('[data-id=wallet-account]').value = `m/44'/${coinType}'/${accountIndex}'`;

		let walletId;
		let xprvReceiveKey;
		let xprvChangeKey;
		{
			let walletKey = await DashHd.fromSeed(primarySeedBytes);
			walletId = await DashHd.toId(walletKey);

			let accountKey = await walletKey.deriveAccount(0, {
				purpose: 44, // BIP-44 (default)
				coinType: coinType,
				versions: versions,
			});
			xprvReceiveKey = await accountKey.deriveXKey(DashHd.RECEIVE);
			xprvChangeKey = await accountKey.deriveXKey(DashHd.CHANGE);
		}

		let previousIndex = 0;
		let last = previousIndex + 50;
		for (let i = previousIndex; i < last; i += 1) {
			let failed;
			try {
				let receiveKey = await xprvReceiveKey.deriveAddress(i); // xprvKey from step 2
				await addKey(receiveKey, DashHd.RECEIVE, i);
			} catch (e) {
				failed = true;
			}
			try {
				let changeKey = await xprvChangeKey.deriveAddress(i); // xprvKey from step 2
				addKey(changeKey, DashHd.CHANGE, i);
			} catch (e) {
				failed = true;
			}
			if (failed) {
				// to make up for skipping on error
				last += 1;
			}
		}

		async function addKey(key, usage, i) {
			let wif = await DashHd.toWif(key.privateKey, { version: 'testnet' });
			let address = await DashHd.toAddr(key.publicKey, {
				version: 'testnet',
			});
			let hdpath = `m/44'/${coinType}'/${accountIndex}'/${usage}`; // accountIndex from step 2

			addresses.push(address);
			if (usage === DashHd.RECEIVE) {
				receiveAddrs.push(address);
			} else if (usage === DashHd.CHANGE) {
				changeAddrs.push(address);
			} else {
				let err = new Error(`unknown usage '${usage}'`);
				window.alert(err.message);
				throw err;
			}

			// note: pkh is necessary here because 'getaddressutxos' is unreliable
			//       and neither 'getaddressdeltas' nor 'getaddressmempool' have 'script'
			let pkhBytes = await DashKeys.pubkeyToPkh(key.publicKey);
			keysMap[address] = {
				walletId: walletId,
				index: i,
				hdpath: hdpath, // useful for multi-account indexing
				address: address, // XrZJJfEKRNobcuwWKTD3bDu8ou7XSWPbc9
				wif: wif, // XCGKuZcKDjNhx8DaNKK4xwMMNzspaoToT6CafJAbBfQTi57buhLK
				key: key,
				publicKey: DashKeys.utils.bytesToHex(key.publicKey),
				pubKeyHash: DashKeys.utils.bytesToHex(pkhBytes),
			};
		}

		await updateDeltas(addresses);
		renderAddresses();

		$('body').removeAttribute('hidden');
		renderCoins();
	}

	async function updateDeltas(addrs) {
		for (let address of addrs) {
			let info = dbGet(address);
			let isSpent = info && info.deltas?.length && !info.balance;
			if (!isSpent) {
				continue; // used address (only check on manual sync)
			}

			let knownSpent = spentAddrs.includes(address);
			if (!knownSpent) {
				spentAddrs.push(address);
			}
			removeElement(addrs, info.address);
			removeElement(addresses, info.address);
			removeElement(receiveAddrs, info.address);
			removeElement(changeAddrs, info.address);
		}

		let deltaLists = await Promise.all([
			// See
			// - <https://trpc.digitalcash.dev/#?method=getaddressdeltas&params=[{"addresses":["ybLxVb3aspSHFgxM1qTyuBSXnjAqLFEG8P"]}]&submit>
			// - <https://trpc.digitalcash.dev/#?method=getaddressmempool&params=[{"addresses":["ybLxVb3aspSHFgxM1qTyuBSXnjAqLFEG8P"]}]&submit>
			await rpc('getaddressdeltas', { addresses: addrs }),
			// TODO check for proof of instantsend / acceptance
			await rpc('getaddressmempool', { addresses: addrs }),
		]);
		for (let deltaList of deltaLists) {
			for (let delta of deltaList) {
				console.log('DEBUG delta', delta);
				removeElement(addrs, delta.address);
				removeElement(addresses, delta.address);
				removeElement(receiveAddrs, delta.address);
				removeElement(changeAddrs, delta.address);
				if (!deltasMap[delta.address]) {
					deltasMap[delta.address] = { balance: 0, deltas: [] };
				}
				deltasMap[delta.address].deltas.push(delta);
				deltasMap[delta.address].balance += delta.satoshis;
			}
		}
	}

	function renderCoins() {
		let totalBalance = 0;
		//let balances = [];
		let addrs = Object.keys(deltasMap);
		let elementStrs = [];
		let template = $('[data-id=coin-row-tmpl]').content;
		for (let addr of addrs) {
			let info = deltasMap[addr];
			console.log('DEBUG delta info', info);
			dbSet(addr, info);
			if (info.balance === 0) {
				continue;
			}
			totalBalance += info.balance;
			//let amount = delta.balance / SATS;
			//let amountStr = amount.toFixed(8);
			// balances.push(`${addr}: ${info.deltas.length}: ${amountStr}`);

			for (let delta of info.deltas) {
				let amount = delta.satoshis / SATS;
				Object.assign(delta, { amount: amount });

				let clone = document.importNode(template, true);
				$('[data-name=coin]', clone).value = [
					delta.address,
					delta.txid,
					delta.index,
				].join(',');
				$('[data-name=address]', clone).textContent = delta.address;
				$('[data-name=amount]', clone).textContent = delta.amount.toFixed(4);
				$('[data-name=txid]', clone).textContent = delta.txid;
				$('[data-name=output-index]', clone).textContent = delta.index;

				elementStrs.push(clone.firstElementChild.outerHTML);
				//tableBody.appendChild(clone);
			}
		}

		let totalAmount = totalBalance / SATS;
		$('[data-id=total-balance]').innerText = totalAmount.toFixed(4);

		let tableBody = $('[data-id=coins-table]');
		tableBody.textContent = '';
		tableBody.insertAdjacentHTML('beforeend', elementStrs.join('\n'));
		//$('[data-id=balances]').innerText = balances.join('\n');

		if (totalBalance < MIN_BALANCE) {
			setTimeout(function () {
				window.alert(
					'Error: Balance too low. Please fill up at CN 💸 and/or DCG 💸.',
				);
			}, 300);
		}
	}

	async function main() {
		if (network === `testnet`) {
			let $testnets = $$('[data-network=testnet]');
			for (let $testnet of $testnets) {
				$testnet.removeAttribute('hidden');
			}
		}

		await init();
	}

	main().catch(function (err) {
		console.error(`Error in main:`, err);
	});
})();
