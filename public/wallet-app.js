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

	let DashJoin = window.DashJoin;

	let App = {};
	window.App = App;

	const SATS = 100000000;
	const MIN_BALANCE = 100001 * 1000;

	let network = 'testnet';
	let rpcBaseUrl = 'https://trpc.digitalcash.dev/';
	let rpcBasicAuth = btoa(`api:null`);

	let addresses = [];
	let changeAddrs = [];
	let receiveAddrs = [];
	let spentAddrs = [];
	let spendableAddrs = [];
	let deltasMap = {};
	let keysMap = {};
	let denomsMap = {};

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
	console.log('DEBUG dashTx instance', dashTx);

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

	function getAllUtxos() {
		let utxos = [];
		let spendableAddrs = Object.keys(deltasMap);
		for (let address of spendableAddrs) {
			let info = deltasMap[address];
			if (info.balance === 0) {
				continue;
			}
			for (let coin of info.deltas) {
				if (coin.reserved) {
					continue;
				}
				Object.assign(coin, {
					outputIndex: coin.index,
					denom: DashJoin.getDenom(coin.satoshis),
				});
				utxos.push(coin);
			}
		}
		return utxos;
	}

	function removeElement(arr, val) {
		let index = arr.indexOf(val);
		if (index !== -1) {
			arr.splice(index, 1);
		}
	}

	App.toggleAll = function (event) {
		let checked = event.target.checked;

		let $table = event.target.closest('table');
		for (let $input of $$('[type=checkbox]', $table)) {
			$input.checked = checked;
		}
		return true;
	};

	App.setMax = function (event) {
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

	App.sendDash = async function (event) {
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
				Object.assign(coin, { outputIndex: coin.index });
				inputs.push(coin);
			}
			balance = DashTx.sum(inputs);
		} else {
			utxos = getAllUtxos();
			balance = DashTx.sum(utxos);
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
		let draft = await draftWalletTx(utxos, inputs, output);

		amount = output.satoshis / SATS;
		$('[data-id=send-dust]').textContent = draft.tx.feeTarget;
		$('[data-id=send-amount]').textContent = amount.toFixed(8);

		let signedTx = await dashTx.legacy.finalizePresorted(draft.tx);
		console.log('DEBUG signed tx', signedTx);
		{
			let amountStr = amount.toFixed(4);
			let confirmed = window.confirm(`Really send ${amountStr} to ${address}?`);
			if (!confirmed) {
				return;
			}
		}
		void (await rpc('sendrawtransaction', signedTx.transaction));
		void (await commitWalletTx(signedTx));
	};

	async function draftWalletTx(utxos, inputs, output) {
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

		return {
			tx: draftTx,
			change: changeOutput,
		};
	}

	async function commitWalletTx(signedTx) {
		let updatedAddrs = [];
		for (let input of signedTx.inputs) {
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
		for (let output of signedTx.outputs) {
			updatedAddrs.push(output.address);
			removeElement(addresses, output.address);
			removeElement(receiveAddrs, output.address);
			removeElement(changeAddrs, output.address);
			delete deltasMap[output.address];
			dbSet(output.address, null);
		}
		await updateDeltas(updatedAddrs);

		let txid = await DashTx.getId(signedTx.transaction);
		for (let input of signedTx.inputs) {
			let coin = selectCoin(input.address, input.txid, input.outputIndex);
			if (!coin) {
				continue;
			}
			coin.reserved = true; // mark as spent-ish
		}
		for (let i = 0; i < signedTx.outputs.length; i += 1) {
			let output = signedTx.outputs[i];
			let info = deltasMap[output.address];
			if (!info) {
				info = { balance: 0, deltas: [] };
				deltasMap[output.address] = info;
			}
			let memCoin = selectCoin(output.address, txid, i);
			if (!memCoin) {
				memCoin = {
					address: output.address,
					satoshis: output.satoshis,
					txid: txid,
					index: i,
				};
				info.deltas.push(memCoin);
			}
		}

		renderAddresses();
		renderCoins();
	}

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

	let defaultCjSlots = [
		{
			denom: 1000010000,
			priority: 1,
			have: 0,
			want: 2,
			need: 0,
		},
		{
			denom: 100001000,
			priority: 10,
			have: 0,
			want: 10,
			need: 0,
		},
		{
			denom: 10000100,
			priority: 10,
			have: 0,
			want: 50,
			need: 0,
		},
		{
			denom: 1000010,
			priority: 1,
			have: 0,
			want: 20,
			need: 0,
		},
		{
			denom: 100001,
			priority: 0,
			have: 0,
			want: 5,
			need: 0,
		},
	];
	function getCashDrawer() {
		let slots = dbGet('cash-drawer-control', []);
		if (!slots.length) {
			slots = defaultCjSlots.slice(0);
			dbSet('cash-drawer-control', slots);
		}
		return slots;
	}
	App.syncCashDrawer = function (event) {
		let isDirty = false;

		let slots = getCashDrawer();
		for (let slot of slots) {
			let $row = $(`[data-denom="${slot.denom}"]`);

			let priorityStr = $('[name=priority]', $row).value;
			if (priorityStr) {
				let priority = parseFloat(priorityStr);
				if (slot.priority !== priority) {
					isDirty = true;
					slot.priority = priority;
				}
			}

			let wantStr = $('[name=want]', $row).value;
			if (wantStr) {
				let want = parseFloat(wantStr);
				if (slot.want !== want) {
					isDirty = true;
					slot.want = want;
				}
			}
		}

		for (let slot of slots) {
			let addrs = Object.keys(denomsMap[slot.denom]);
			let have = addrs.length;
			let need = slot.want - have;
			need = Math.max(0, need);
			if (need !== slot.need) {
				isDirty = true;
				slot.need = need;
			}
		}

		if (isDirty) {
			dbSet('cash-drawer-control', slots);
		}

		renderCashDrawer();
		return true;
	};

	function renderCashDrawer() {
		let cjBalance = 0;
		let slots = getCashDrawer();
		for (let slot of slots) {
			let $row = $(`[data-denom="${slot.denom}"]`);
			let addrs = Object.keys(denomsMap[slot.denom]);
			let have = addrs.length;
			slot.need = slot.want - have;
			slot.need = Math.max(0, slot.need);

			let priority = $('[name=priority]', $row).value;
			if (priority) {
				if (priority !== slot.priority.toString()) {
					$('[name=priority]', $row).value = slot.priority;
				}
			}
			let want = $('[name=want]', $row).value;
			if (want) {
				if (want !== slot.want.toString()) {
					$('[name=want]', $row).value = slot.want;
				}
			}

			$('[data-name=have]', $row).textContent = have;
			$('[data-name=need]', $row).textContent = slot.need;

			for (let addr of addrs) {
				cjBalance += denomsMap[slot.denom][addr].satoshis;
			}
		}

		let cjAmount = cjBalance / SATS;
		$('[data-id=cj-balance]').textContent = cjAmount.toFixed(8);
	}

	App.denominateCoins = async function (event) {
		console.log('DENOMINATE COINS');
		event.preventDefault();

		{
			let addrs = Object.keys(deltasMap);
			spendableAddrs.length = 0;

			for (let address of addrs) {
				let info = deltasMap[address];
				if (info.balance === 0) {
					continue;
				}
				spendableAddrs.push(address);
			}
		}

		let slots = dbGet('cash-drawer-control');
		console.log('slots', slots);

		let priorityGroups = groupSlotsByPriorityAndAmount(slots);
		console.log('priorityGroups', priorityGroups);

		let priorities = Object.keys(priorityGroups);
		priorities.sort(sortNumberDesc);
		console.log('priorities', priorities);

		for (let priority of priorities) {
			let slots = priorityGroups[priority].slice(0);
			slots.sort(sortSlotsByDenomDesc);

			for (;;) {
				let slot = slots.shift();
				if (!slot) {
					console.log('e: no slot');
					break;
				}
				let isNeeded = slot.need >= 1;
				if (!isNeeded) {
					console.log('s: not needed', slot.denom);
					continue;
				}

				let utxos = getAllUtxos();
				let coins = DashTx._legacySelectOptimalUtxos(utxos, slot.denom);
				let sats = DashTx.sum(coins);
				if (sats < slot.denom) {
					console.log(`not enough coins for ${slot.denom}`);
					continue;
				}

				for (let coin of coins) {
					coin.reserved = true;
				}
				slot.need -= 1;

				// TODO DashTx.
				console.log('Found coins to make denom', slot.denom, coins);
				let roundRobiner = createRoundRobin(slots, slot);
				// roundRobiner();

				let address = receiveAddrs.shift();
				let satoshis = slot.denom;
				let output = { satoshis, address };

				void (await confirmAndBroadcastAndCompleteTx(coins, output).then(
					roundRobiner,
				));
			}
		}
	};

	function createRoundRobin(slots, slot) {
		return function () {
			if (slot.need >= 1) {
				// round-robin same priority
				slots.push(slot);
			}
		};
	}

	async function confirmAndBroadcastAndCompleteTx(inputs, output) {
		let utxos = null;
		let draft = await draftWalletTx(utxos, inputs, output);

		let signedTx = await dashTx.legacy.finalizePresorted(draft.tx);
		{
			console.log('DEBUG confirming signed tx', signedTx);
			let amount = output.satoshis / SATS;
			let amountStr = amount.toFixed(4);
			let confirmed = window.confirm(
				`Really send ${amountStr} to ${output.address}?`,
			);
			if (!confirmed) {
				return;
			}
		}
		void (await rpc('sendrawtransaction', signedTx.transaction));
		void (await commitWalletTx(signedTx));
	}

	function groupSlotsByPriorityAndAmount(slots) {
		let priorityGroups = {};
		for (let slot of slots) {
			if (!priorityGroups[slot.priority]) {
				priorityGroups[slot.priority] = [];
			}
			priorityGroups[slot.priority].push(slot);
		}

		return priorityGroups;
	}

	function sortNumberDesc(a, b) {
		if (Number(a) < Number(b)) {
			return 1;
		}
		if (Number(a) > Number(b)) {
			return -1;
		}
		return 0;
	}

	function sortSlotsByDenomDesc(a, b) {
		if (a.denom < b.denom) {
			return 1;
		}
		if (a.denom > b.denom) {
			return -1;
		}
		return 0;
	}

	function sortCoinsByDenomAndSatsDesc(a, b) {
		if (a.denom < b.denom) {
			return 1;
		}
		if (a.denom > b.denom) {
			return -1;
		}

		if (a.satoshis < b.satoshis) {
			return 1;
		}
		if (a.satoshis > b.satoshis) {
			return -1;
		}
		return 0;
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
		let addrs = Object.keys(deltasMap);
		for (let addr of addrs) {
			let info = deltasMap[addr];
			dbSet(addr, info);
		}

		let utxos = getAllUtxos();
		utxos.sort(sortCoinsByDenomAndSatsDesc);

		let elementStrs = [];
		let template = $('[data-id=coin-row-tmpl]').content;
		for (let utxo of utxos) {
			let amount = utxo.satoshis / SATS;
			Object.assign(utxo, { amount: amount });

			let clone = document.importNode(template, true);
			$('[data-name=coin]', clone).value = [
				utxo.address,
				utxo.txid,
				utxo.outputIndex,
			].join(',');
			$('[data-name=address]', clone).textContent = utxo.address;
			$('[data-name=amount]', clone).textContent = utxo.amount.toFixed(4);
			if (utxo.denom) {
				$('[data-name=amount]', clone).style.fontStyle = 'italic';
				$('[data-name=amount]', clone).style.fontWeight = 'bold';
			} else {
				//
			}
			$('[data-name=txid]', clone).textContent = utxo.txid;
			$('[data-name=output-index]', clone).textContent = utxo.index;

			elementStrs.push(clone.firstElementChild.outerHTML);
			//tableBody.appendChild(clone);
		}

		let totalBalance = DashTx.sum(utxos);
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

	function siftDenoms() {
		for (let denom of DashJoin.DENOMS) {
			if (!denomsMap[denom]) {
				denomsMap[denom] = {};
			}
		}

		let addrs = Object.keys(deltasMap);
		for (let addr of addrs) {
			let info = deltasMap[addr];
			if (info.balance === 0) {
				continue;
			}

			for (let coin of info.deltas) {
				let denom = DashJoin.getDenom(coin.satoshis);
				if (!denom) {
					continue;
				}

				console.log('DEBUG denom', denom, coin);
				denomsMap[denom][coin.address] = coin;
			}
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
		siftDenoms();
		renderCashDrawer();
		App.syncCashDrawer();
	}

	main().catch(function (err) {
		console.error(`Error in main:`, err);
	});
})();
