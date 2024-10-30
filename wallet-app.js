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
	let DashP2P = window.DashP2P;

	let App = {};
	window.App = App;

	const SATS = 100000000;
	const MIN_BALANCE = 100001 * 1000;

	let network = 'testnet';
	let rpcBasicAuth = `api:null`;
	let rpcBaseUrl = `https://${rpcBasicAuth}@trpc.digitalcash.dev/`;
	let rpcExplorer = 'https://trpc.digitalcash.dev/';

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
				return null;
				// let pkhBytes = DashKeys.utils.hexToBytes(txInput.pubKeyHash);
				// address = await DashKeys.pkhToAddr(pkhBytes, { version: network });
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
		let result = await DashTx.utils.rpc(rpcBaseUrl, method, ...params);
		return result;
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

	function getAllUtxos(opts) {
		let utxos = [];
		let spendableAddrs = Object.keys(deltasMap);
		for (let address of spendableAddrs) {
			let info = deltasMap[address];
			info.balance = DashTx.sum(info.deltas);

			for (let coin of info.deltas) {
				let addressInfo = keysMap[coin.address];
				Object.assign(coin, {
					outputIndex: coin.index,
					denom: DashJoin.getDenom(coin.satoshis),
					publicKey: addressInfo.publicKey,
					pubKeyHash: addressInfo.pubKeyHash,
				});

				if (coin.reserved > 0) {
					continue;
				}

				if (opts?.denom === false) {
					if (coin.denom) {
						continue;
					}
				}

				if (info.balance === 0) {
					break;
				}
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

		$('[data-id=send-amount]').value = toFixed(totalAmount, 4);
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
			let availableStr = toFixed(available, 4);
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
		$('[data-id=send-amount]').textContent = toFixed(amount, 8);

		let signedTx = await dashTx.legacy.finalizePresorted(draft.tx);
		console.log('DEBUG signed tx', signedTx);
		{
			let amountStr = toFixed(amount, 4);
			let confirmed = window.confirm(`Really send ${amountStr} to ${address}?`);
			if (!confirmed) {
				return;
			}
		}
		void (await rpc('sendrawtransaction', signedTx.transaction));
		void (await commitWalletTx(signedTx));
	};

	App.exportWif = async function (event) {
		event.preventDefault();

		let address = $('[data-id=export-address]').value;
		let privKey = await keyUtils.getPrivateKey({ address });
		let wif = await DashKeys.privKeyToWif(privKey, { version: network });

		$('[data-id=export-wif]').textContent = wif;
	};

	App.sendMemo = async function (event) {
		event.preventDefault();

		let msg;

		/** @type {String?} */
		let memo = $('[name=memo]').value || '';
		/** @type {String?} */
		let message = null;
		let memoEncoding = $('[name=memo-encoding]:checked').value || 'hex';
		if (memoEncoding !== 'hex') {
			message = memo;
			memo = null;
		}
		let burn = 0;
		msg = memo || message;

		let signedTx = await App._signMemo({ burn, memo, message });
		{
			let confirmed = window.confirm(
				`Really send '${memoEncoding}' memo '${msg}'?`,
			);
			if (!confirmed) {
				return;
			}
		}
		let txid = await rpc('sendrawtransaction', signedTx.transaction);
		$('[data-id=memo-txid]').textContent = txid;
		let link = `${rpcExplorer}#?method=getrawtransaction&params=["${txid}",1]&submit`;
		$('[data-id=memo-link]').textContent = link;
		$('[data-id=memo-link]').href = link;
		void (await commitWalletTx(signedTx));
	};

	App._signMemo = async function ({
		burn = 0,
		memo = null,
		message = null,
		collateral = 0,
	}) {
		let satoshis = burn;
		satoshis += collateral; // temporary, for fee calculations only

		let memoOutput = { satoshis, memo, message };
		let outputs = [memoOutput];
		let changeOutput = {
			address: '',
			pubKeyHash: '',
			satoshis: 0,
			reserved: 0,
		};

		let utxos = getAllUtxos({ denom: false });
		let txInfo = DashTx.createLegacyTx(utxos, outputs, changeOutput);
		if (txInfo.changeIndex >= 0) {
			let realChange = txInfo.outputs[txInfo.changeIndex];
			realChange.address = changeAddrs.shift();
			let pkhBytes = await DashKeys.addrToPkh(realChange.address, {
				version: network,
			});
			realChange.pubKeyHash = DashKeys.utils.bytesToHex(pkhBytes);
		}
		memoOutput.satoshis -= collateral; // adjusting for fee
		console.log('DEBUG', txInfo);

		let now = Date.now();
		for (let input of txInfo.inputs) {
			input.reserved = now;
		}
		for (let output of txInfo.outputs) {
			output.reserved = now;
		}

		txInfo.inputs.sort(DashTx.sortInputs);
		txInfo.outputs.sort(DashTx.sortOutputs);

		let signedTx = await dashTx.hashAndSignAll(txInfo);
		console.log('memo signed', signedTx);
		return signedTx;
	};

	App._signCollateral = async function (collateral = DashJoin.MIN_COLLATERAL) {
		let signedTx = await App._signMemo({
			burn: 0,
			memo: '',
			message: null,
			collateral: DashJoin.MIN_COLLATERAL,
		});
		console.log('collat signed', signedTx);
		let signedTxBytes = DashTx.utils.hexToBytes(signedTx.transaction);
		return signedTxBytes;
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
			if (output.memo) {
				draftTx.feeTarget += output.satoshis;
				output.satoshis = 0;
				continue;
			}
			if (!output.address) {
				if (typeof output.memo !== 'string') {
					let err = new Error(`output is missing 'address' and 'pubKeyHash'`);
					window.alert(err.message);
					throw err;
				}
			} else {
				let pkhBytes = await DashKeys.addrToPkh(output.address, {
					version: network,
				});
				Object.assign(output, {
					pubKeyHash: DashKeys.utils.bytesToHex(pkhBytes),
				});
			}
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
			let isMemo = !output.address;
			if (isMemo) {
				continue;
			}
			updatedAddrs.push(output.address);
			removeElement(addresses, output.address);
			removeElement(receiveAddrs, output.address);
			removeElement(changeAddrs, output.address);
			delete deltasMap[output.address];
			dbSet(output.address, null);
		}
		await updateDeltas(updatedAddrs);

		let txid = await DashTx.getId(signedTx.transaction);
		let now = Date.now();
		for (let input of signedTx.inputs) {
			let coin = selectCoin(input.address, input.txid, input.outputIndex);
			if (!coin) {
				continue;
			}
			coin.reserved = now; // mark as spent-ish
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

			// TODO put this somewhere safe
			// let descriptor = `pkh([${walletId}/${partialPath}/0/${index}])`;

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
		// {
		// 	denom: 10000,
		// 	priority: 0,
		// 	have: 0,
		// 	want: 100,
		// 	need: 0,
		// 	collateral: true,
		// },
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
		$('[data-id=cj-balance]').textContent = toFixed(cjAmount, 8);
	}

	App.denominateCoins = async function (event) {
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

		let priorityGroups = groupSlotsByPriorityAndAmount(slots);

		let priorities = Object.keys(priorityGroups);
		priorities.sort(sortNumberDesc);

		for (let priority of priorities) {
			let slots = priorityGroups[priority].slice(0);
			slots.sort(sortSlotsByDenomDesc);

			for (;;) {
				let slot = slots.shift();
				if (!slot) {
					break;
				}
				let isNeeded = slot.need >= 1;
				if (!isNeeded) {
					continue;
				}

				let utxos = getAllUtxos();
				let coins = DashTx._legacySelectOptimalUtxos(utxos, slot.denom);
				let sats = DashTx.sum(coins);
				if (sats < slot.denom) {
					console.log(`not enough coins for ${slot.denom}`);
					continue;
				}

				let now = Date.now();
				for (let coin of coins) {
					coin.reserved = now;
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
			let amountStr = toFixed(amount, 4);
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
			$('[data-name=amount]', clone).textContent = toFixed(utxo.amount, 4);
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
		$('[data-id=total-balance]').innerText = toFixed(totalAmount, 4);

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
		if (!denomsMap[DashJoin.MIN_COLLATERAL]) {
			denomsMap[DashJoin.MIN_COLLATERAL] = {};
		}
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
					let halfCollateral = DashJoin.MIN_COLLATERAL / 2;
					let fitsCollateral =
						coin.satoshis >= halfCollateral &&
						coin.satoshis < DashJoin.DENOM_LOWEST;
					if (fitsCollateral) {
						denomsMap[DashJoin.MIN_COLLATERAL][coin.address] = coin;
					}
					continue;
				}

				console.log('DEBUG denom', denom, coin);
				denomsMap[denom][coin.address] = coin;
			}
		}
	}

	/**
	 * @param {Number} f - the number
	 * @param {Number} d - how many digits to truncate (round down) at
	 */
	function toFixed(f, d) {
		let order = Math.pow(10, d);
		let t = f * order;
		t = Math.floor(t);
		f = t / order;
		return f.toFixed(d);
	}

	async function connectToPeer(evonode, height) {
		if (App.peers[evonode.host]) {
			return App.peers[evonode.host];
		}

		let p2p = DashP2P.create();

		let p2pWebProxyUrl = 'wss://tp2p.digitalcash.dev/ws';
		let query = {
			access_token: 'secret',
			hostname: evonode.hostname,
			port: evonode.port,
		};
		let searchParams = new URLSearchParams(query);
		let search = searchParams.toString();
		let wsc = new WebSocket(`${p2pWebProxyUrl}?${search}`);

		await p2p.initWebSocket(wsc, {
			network: network,
			hostname: evonode.hostname,
			port: evonode.port,
			start_height: height,
		});

		let senddsqBytes = DashJoin.packers.senddsq({ network: network });
		console.log('[REQ: %csenddsq%c]', 'color: $55daba', 'color: inherit');
		p2p.send(senddsqBytes);

		void p2p.createSubscriber(['dsq'], async function (evstream) {
			let msg = await evstream.once('dsq');
			let dsq = DashJoin.parsers.dsq(msg.payload);
			let dsqStatus = {
				// node info
				host: evonode.host,
				hostname: evonode.hostname,
				port: evonode.port,
				// dsq status
				denomination: dsq.denomination,
				ready: dsq.ready,
				timestamp: dsq.timestamp,
				timestamp_unix: dsq.timestamp_unix,
			};

			App.coinjoinQueues[dsq.denomination][evonode.host] = dsqStatus;
			console.log(
				'%c[[DSQ]]',
				'color: #bada55',
				dsqStatus.denomination,
				dsqStatus.ready,
				dsqStatus.host,
			);
		});

		function cleanup(err) {
			console.error('WebSocket Error:', err);
			delete App.peers[evonode.host];
			for (let denom of DashJoin.DENOMS) {
				delete App.coinjoinQueues[denom][evonode.host];
			}
			p2p.close();
		}
		wsc.addEventListener('error', cleanup);

		App.peers[evonode.host] = p2p;
		return App.peers[evonode.host];
	}

	// 0. 'dsq' broadcast puts a node in the local in-memory pool
	// 1. 'dsa' requests to be allowed to join a session
	// 2. 'dssu' accepts
	//      + 'dsq' marks ready (in either order)
	// 3. 'dsi' signals desired coins in and out
	// 4. 'dsf' accepts specific coins in and out
	// 5. 'dss' sends signed inputs paired to trusted outputs
	// 6. 'dssu' updates status
	//      + 'dsc' confirms the tx will broadcast soon
	async function createCoinJoinSession(
		evonode, // { host }
		inputs, // [{address, txid, pubKeyHash, ...getPrivateKeyInfo }]
		outputs, // [{ pubKeyHash, satoshis }]
		collateralTxes, // (for dsa and dsi) any 2 txes having fees >=0.00010000 more than necessary
	) {
		let p2p = App.peers[evonode.host];
		if (!p2p) {
			throw new Error(`'${evonode.host}' is not connected`);
		}

		let denomination = inputs[0].satoshis;
		for (let input of inputs) {
			if (input.satoshis !== denomination) {
				let msg = `utxo.satoshis (${input.satoshis}) must match requested denomination ${denomination}`;
				throw new Error(msg);
			}
		}
		for (let output of outputs) {
			if (!output.sateshis) {
				output.satoshis = denomination;
				continue;
			}
			if (output.satoshis !== denomination) {
				let msg = `output.satoshis (${output.satoshis}) must match requested denomination ${denomination}`;
				throw new Error(msg);
			}
		}

		// todo: pick a smaller size that matches the dss
		let message = new Uint8Array(DashP2P.PAYLOAD_SIZE_MAX);
		let evstream = p2p.createSubscriber(['dssu', 'dsq', 'dsf', 'dsc']);

		{
			let collateralTx = collateralTxes.shift();
			let dsa = {
				network,
				message,
				denomination,
				collateralTx,
			};
			let dsaBytes = DashJoin.packers.dsa(dsa);
			console.log('DEBUG dsa, dsaBytes', dsa, dsaBytes);
			p2p.send(dsaBytes);
			for (;;) {
				let msg = await evstream.once();

				if (msg.command === 'dsq') {
					let dsq = DashJoin.parsers.dsq(msg.payload);
					if (dsq.denomination !== denomination) {
						continue;
					}
					if (!dsq.ready) {
						continue;
					}
					break;
				}

				if (msg.command === 'dssu') {
					let dssu = DashJoin.parsers.dssu(msg.payload);
					if (dssu.state === 'ERROR') {
						evstream.close();
						throw new Error();
					}
				}
			}
		}

		let dsfTxRequest;
		{
			let collateralTx = collateralTxes.shift();
			let dsiBytes = DashJoin.packers.dsi({
				network,
				message,
				inputs,
				collateralTx,
				outputs,
			});
			p2p.send(dsiBytes);
			let msg = await evstream.once('dsf');
			console.log('DEBUG dsf %c[[MSG]]', 'color: blue', msg);
			let dsfTxRequest = DashJoin.parsers.dsf(msg.payload);
			console.log('DEBUG dsf', dsfTxRequest, inputs);

			makeSelectedInputsSignable(dsfTxRequest, inputs);
			let txSigned = await dashTx.hashAndSignAll(dsfTxRequest);

			let signedInputs = [];
			for (let input of txSigned.inputs) {
				if (!input?.signature) {
					continue;
				}
				signedInputs.push(input);
			}
			assertSelectedOutputs(dsfTxRequest, outputs, inputs.length);

			let dssBytes = DashJoin.packers.dss({
				network: network,
				message: message,
				inputs: signedInputs,
			});
			p2p.send(dssBytes);
			void (await evstream.once('dsc'));
		}

		return dsfTxRequest;
	}

	function makeSelectedInputsSignable(txRequest, inputs) {
		// let selected = [];

		for (let input of inputs) {
			if (!input.publicKey) {
				let msg = `coin '${input.address}:${input.txid}:${input.outputIndex}' is missing 'input.publicKey'`;
				throw new Error(msg);
			}
			for (let sighashInput of txRequest.inputs) {
				if (sighashInput.txid !== input.txid) {
					continue;
				}
				if (sighashInput.outputIndex !== input.outputIndex) {
					continue;
				}

				let sigHashType = DashTx.SIGHASH_ALL | DashTx.SIGHASH_ANYONECANPAY; //jshint ignore:line

				console.log(sighashInput);
				console.log(input);
				sighashInput.index = input.index;
				sighashInput.address = input.address;
				sighashInput.satoshis = input.satoshis;
				sighashInput.pubKeyHash = input.pubKeyHash;
				// sighashInput.script = input.script;
				sighashInput.publicKey = input.publicKey;
				sighashInput.sigHashType = sigHashType;
				// sighashInputs.push({
				//      txId: input.txId || input.txid,
				//      txid: input.txid || input.txId,
				//      outputIndex: input.outputIndex,
				//      pubKeyHash: input.pubKeyHash,
				//      sigHashType: input.sigHashType,
				// });

				// selected.push(input);
				break;
			}
		}

		// return selected;
	}

	function assertSelectedOutputs(txRequest, outputs, count) {
		let _count = 0;
		for (let output of outputs) {
			for (let sighashOutput of txRequest.outputs) {
				if (sighashOutput.pubKeyHash !== output.pubKeyHash) {
					continue;
				}
				if (sighashOutput.satoshis !== output.satoshis) {
					continue;
				}

				_count += 1;
			}
		}

		if (count !== _count) {
			let msg = `expected ${count} matching outputs but found found ${_count}`;
			throw new Error(msg);
		}
	}

	App.peers = {};

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

		App._rawmnlist = await rpc('masternodelist');
		App._chaininfo = await rpc('getblockchaininfo');
		console.log(App._rawmnlist);
		App._evonodes = DashJoin.utils._evonodeMapToList(App._rawmnlist);
		// 35.166.18.166:19999
		let index = 5;
		// let index = Math.floor(Math.random() * App._evonodes.length);
		// App._evonode = App._evonodes[index];
		App._evonode = App._evonodes.at(index);
		// App._evonode = {
		// 	host: '35.166.18.166:19999',
		// 	hostname: '35.166.18.166',
		// 	port: '19999',
		// };
		console.info('[info] chosen evonode:', index);
		console.log(JSON.stringify(App._evonode, null, 2));

		App.coinjoinQueues = {
			100001: {}, //      0.00100001
			1000010: {}, //     0.01000010
			10000100: {}, //    0.10000100
			100001000: {}, //   1.00001000
			1000010000: {}, // 10.00010000
		};

		void (await connectToPeer(App._evonode, App._chaininfo.blocks));
	}

	App.createCoinJoinSession = async function () {
		let $coins = $$('[data-name=coin]:checked');
		if (!$coins.length) {
			let msg =
				'Use the Coins table to select which coins to include in the CoinJoin session.';
			window.alert(msg);
			return;
		}

		let inputs = [];
		let outputs = [];
		let denom;
		for (let $coin of $coins) {
			let [address, txid, indexStr] = $coin.value.split(',');
			let index = parseInt(indexStr, 10);
			let coin = selectCoin(address, txid, index);
			coin.denom = DashJoin.getDenom(coin.satoshis);
			if (!coin.denom) {
				let msg = 'CoinJoin requires 10s-Denominated coins, shown in BOLD.';
				window.alert(msg);
				return;
			}
			if (!denom) {
				denom = coin.denom;
			}
			if (coin.denom !== denom) {
				let msg =
					'CoinJoin requires all coins to be of the same denomination (ex: three 0.01, or two 1.0, but not a mix of the two).';
				window.alert(msg);
				return;
			}
			Object.assign(coin, { outputIndex: coin.index });
			inputs.push(coin);

			let output = {
				address: receiveAddrs.shift(),
				satoshis: denom,
				pubKeyHash: '',
			};
			let pkhBytes = await DashKeys.addrToPkh(output.address, {
				version: network,
			});
			output.pubKeyHash = DashKeys.utils.bytesToHex(pkhBytes);
			outputs.push(output);
		}

		let collateralTxes = [
			await App._signCollateral(DashJoin.MIN_COLLATERAL),
			await App._signCollateral(DashJoin.MIN_COLLATERAL),
		];

		await createCoinJoinSession(
			App._evonode,
			inputs, // [{address, txid, pubKeyHash, ...getPrivateKeyInfo }]
			outputs, // [{ pubKeyHash, satoshis }]
			collateralTxes, // any tx with fee >= 0.00010000
		);
	};

	main().catch(function (err) {
		console.error(`Error in main:`, err);
	});
})();
