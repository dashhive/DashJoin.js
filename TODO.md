
- [ ] Lib.LogPrint
- [ ] Lib.sort:
	- [ ] `vecTally = Lib.sort(vecTally,function(a, b) {`

# Wallet functions (add these to `src/wallet.js`)
- [ ] Lib.mixingWallet.SelectCoinsGroupedByAddresses(true, true, true, 400);
- [ ] Lib.mixingWallet.HasCollateralInputs();

# CompactTallyItem
- [ ] Port this to `src/compact-tally-item.js`

# CTransactionBuilder
- defined in `src/coinjoin/util.h`
- code in `src/coinjoin/util.cpp`
- [ ] Port this to `src/transaction-builder.js`
- [ ] `let txBuilder = new CTransactionBuilder(pwallet,tallyItem);`
	- this might actually be delegated to the frontend

