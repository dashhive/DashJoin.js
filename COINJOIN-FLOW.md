# Overview
CoinJoin from a high level networking perspective

# Flow
For more info, see: [Official DASH Core CoinJoin Specs](https://dashcore.readme.io/docs/core-guide-dash-features-privatesend)

# Step 0: Setup a connection to a master node
```
let Network = require('./network.js');
let COIN = require('./coin.js').COIN;
let MasterNodeConnection = require('./master-node-connection.js').MasterNodeConnection;
let mnConnection = new MasterNodeConnection({
  ip: '127.0.0.1', // assuming you have a master node there
  port: '19998',
  network: 'testnet',
  ourIP: '10.2.1.10,
  startBlockHeight: 87500,	// TODO: will document how to get this
  onStatusChange: stateChanged,
	debugFunction: console.debug,
});
```

## Step 1: client sends `dsa`
```js
function stateChanged(obj) {
  let self = obj.self;
  switch (self.status) {
    default:
      console.info("unhandled status:", self.status);
      break;
		case "NEEDS_AUTH":
		case "EXPECT_VERACK":
    case "EXPECT_HCDP":
    case "RESPOND_VERACK":
			console.info('[ ... ] Handshake in progress');
			break;
    case "READY":
			console.log('[+] Ready to start dealing with CoinJoin traffic...');
				/**
				 * This is where we send the `dsa` message
				 * \/   \/   \/
				 * \/   \/   \/
				 */
				self.client.write(
					Network.packet.coinjoin.dsa({
						chosen_network: network,
						denomination: COIN / 1000 + 1,
						collateral: makeCollateralTx(),
					})
				);
      break;
		case "EXPECT_DSQ":
			console.info("[+] dsa sent");
			break;
  }
}
```
# `dsa` TODO's:
-  Write a function that can
	- [x] Create the correct transaction data bytes from an existing transaction
	- [x] Can encode the bytes to be sent within a `dsa` message

# `dssu` TODO's:
- Write a function that can
	- [ ] Parse all fields of a `dssu` message

