# Roadmap

_A LOT_ of logic is behind creating denominated coins from a user's wallet and
their transactions. If we could hard-code this portion for the time being, we
can focus on the bigger issues of CoinJoin which will allow us to get closer to
a functioning alpha stage than if we perfected and ported the logic from the
denominations. This isn't to say that the denominations logic will not be part
of the final product: it _definitely_ will be part of the end product. The goal
right now is to prove that this SDK can communicate with testnet master nodes
and can participate with a coin join session.

# Alpha goals

1. Connect to the DASH p2p network and to a master node
2. Request to join a coin join queue
3. Participate in mixing
    - using coins that are already broken up into denominations
4. Sign a transaction

-   [ ] Lib.LogPrint
-   [ ] Lib.sort:
    -   [ ] `vecTally = Lib.sort(vecTally,function(a, b) {`

# Wallet functions (add these to `src/wallet.js`)

-   [ ] Lib.mixingWallet.SelectCoinsGroupedByAddresses(true, true, true, 400);
-   [ ] Lib.mixingWallet.HasCollateralInputs();

# CompactTallyItem

-   [ ] Port this to `src/compact-tally-item.js`

# CTransactionBuilder

-   defined in `src/coinjoin/util.h`
-   code in `src/coinjoin/util.cpp`
-   [ ] Port this to `src/transaction-builder.js`
-   [ ] `let txBuilder = new CTransactionBuilder(pwallet,tallyItem);`
    -   this might actually be delegated to the frontend
