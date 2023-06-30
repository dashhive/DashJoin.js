# DashJoin.js
A non-custodial server-side SDK that allows users to mix using DASH's CoinJoin feature.

# Current challenges:
- When sending `dsi` messages, we get: 
```
2023-06-23T06:14:01Z received: dsi (271 bytes) peer=598
2023-06-23T06:14:01Z DSVIN -- txCollateral CTransaction(hash=15fba6d799, ver=3, type=0, vin.size=1, vout.size=2, nLockTime=0, vExtraPayload.size=0)
    CTxIn(COutPoint(74c105f14d20e21f9561f169aa1ea33cb6aef77533a813507ab3ccd8d8afe42b, 0), scriptSig=)
    CTxOut(nValue=0.00020000, scriptPubKey=76a9143e84bba18681f7fbb3f4bec4)
    CTxOut(nValue=0.00030001, scriptPubKey=76a914088d9cc12f9f89ad0de85a44)
2023-06-23T06:14:01Z CCoinJoin::IsCollateralValid -- CTransaction(hash=15fba6d799, ver=3, type=0, vin.size=1, vout.size=2, nLockTime=0, vExtraPayload.size=0)
    CTxIn(COutPoint(74c105f14d20e21f9561f169aa1ea33cb6aef77533a813507ab3ccd8d8afe42b, 0), scriptSig=)
    CTxOut(nValue=0.00020000, scriptPubKey=76a9143e84bba18681f7fbb3f4bec4)
    CTxOut(nValue=0.00030001, scriptPubKey=76a914088d9cc12f9f89ad0de85a44)
2023-06-23T06:14:01Z AcceptToMemoryPoolWithTime: 15fba6d799660930d593f712ebf134fd32146cb990de303598a509ec056b0d91 mandatory-script-verify-flag-failed (Operation not valid with the current stack size) ()
2023-06-23T06:14:01Z CCoinJoin::IsCollateralValid -- didn't pass AcceptToMemoryPool()
2023-06-23T06:14:01Z CCoinJoinServer::AddEntry -- ERROR: collateral not valid!
2023-06-23T06:14:01Z sending dssu (16 bytes) peer=598
2023-06-23T06:14:01Z received: dsi (271 bytes) peer=599
2023-06-23T06:14:01Z DSVIN -- txCollateral CTransaction(hash=78db06661c, ver=3, type=0, vin.size=1, vout.size=2, nLockTime=0, vExtraPayload.size=0)
    CTxIn(COutPoint(781feadaaacd6d81b067a96230855d20499e228ea541d04eeec6bdff3f52a578, 0), scriptSig=)
    CTxOut(nValue=0.00020000, scriptPubKey=76a9143e84bba18681f7fbb3f4bec4)
    CTxOut(nValue=0.00030001, scriptPubKey=76a91413e72bb2fb4988193dad3233)
2023-06-23T06:14:01Z CCoinJoin::IsCollateralValid -- CTransaction(hash=78db06661c, ver=3, type=0, vin.size=1, vout.size=2, nLockTime=0, vExtraPayload.size=0)
    CTxIn(COutPoint(781feadaaacd6d81b067a96230855d20499e228ea541d04eeec6bdff3f52a578, 0), scriptSig=)
    CTxOut(nValue=0.00020000, scriptPubKey=76a9143e84bba18681f7fbb3f4bec4)
    CTxOut(nValue=0.00030001, scriptPubKey=76a91413e72bb2fb4988193dad3233)
2023-06-23T06:14:01Z AcceptToMemoryPoolWithTime: 78db06661c77a82cbcbef81a5f98ba2e8058d725baf75c85771fc7c361252bce mandatory-script-verify-flag-failed (Operation not valid with the current stack size) ()
2023-06-23T06:14:01Z CCoinJoin::IsCollateralValid -- didn't pass AcceptToMemoryPool()
2023-06-23T06:14:01Z CCoinJoinServer::AddEntry -- ERROR: collateral not valid!
2023-06-23T06:14:01Z sending dssu (16 bytes) peer=599
2023-06-23T06:14:01Z received: dsi (271 bytes) peer=596
```

# IN PROGRESS:
  - [ ] Parse `dsi` messages
    - TODO
  - [ ] Send `dsi` messages with correctly format
    - [ ] Send inputs
    - [ ] Send collateral
    - [ ] Send outputs


# Architecture
- `src/launcher.js` 
  - used for launching multiple instances of the `demo.js` script
  - each instance of `demo.js` is given a dashboot instance name and username to fetch

## Seeding
- `bin/dboot` will have all that you'd need to create multiple wallets, addresses, and transactions capable of being used for DashJoin.js development. See the `--help` page.

## Instances
- An instance is just a folder that holds different wallets and other state that is useful for testing DashJoin.js. See `bin/dboot --help` for more info.

# Using `bin/dboot`

## Create a bunch of wallets
This command will create an instance called `base` and create a bunch of different wallets with randomly generated unique names. Each wallet with have many addresses and UTXO's attached to it once dboot is done.
```sh
./bin/dboot --instance=base --create-wallets
```

## Generating DASH to a specific wallet
The following command will generate DASH to the wallet named `ABCD`.
```sh
./bin/dboot --instance=base --generate-to=ABCD
```

## Unlocking all wallets
To unlock all wallets, run:
```sh
./bin/dboot --instance=base --unlock-all
```


# Release Status
TBD

# Install
TBD

# Features
- Networking
	- [x] Authenticate with a Masternode
		- Status: *STABLE*
		- [x] Send `version`
		- [x] Respond to `version` with `verack`
		- [x] Respond to `ping` with `pong`
		- [x] Handle all other requests by a Masternode
      - [x] `sendheaders`
      - [x] `sendcmpct`
      - [x] `senddsq`
      - [x] `getheaders`
      - [x] `sendaddrv2`
	- [x] Transaction encoding
		- Status: *DONE*
		- Overview: A partial implementation of a Transaction is working on a fundamental level. Encoding the transaction for the purpose of creating a collateral transaction is the priority right now.
		- [x] Craft a collateral transaction from user input
			- [x] Place the encoded raw transaction into the `dsa` message
				- See: (DASH `dsa` docs)[https://docs.dash.org/projects/core/en/stable/docs/reference/p2p-network-privatesend-messages.html#dsa]
			
	- [x] Transmitting CoinJoin to a Masternode
		- Status: *IN PROGRESS*
		- Overview: `dsa` message is very close to being correct
		- [x] Send `dsa` message
			- [x] Craft a `dsa` message
				- [x] Encode collateral transactions
					- [x] Encode a single `vin` (transaction input hash - or: "outpoint")
					- [x] Create raw transaction header with this encoded `vin`
				- [x] Transmit collateral transactions
			- notes: dsa packet structure is correct, collateral tx is *ALMOST THERE*
		- [x] Parse `dssu` messages
			- Overview: Generic parsing of `dssu` works, but will need to identify other types of dssu packets. In addition, the dssu packet will likely affect logic moving forward based on things like the Message ID and Pool Status/Pool Status Update fields.
			- [x] Basic parsing of `dssu`
			- [x] Recognizing and translating opcodes to string equivalents
				- for things like pool status update, message ID, etc
			- [x] Handle all message ID response codes
			- [x] Handle all Pool State response codes
			- [x] Handle all Pool Status Update response codes
		- [ ] Parse `dsc` messages
			- TODO
		- [ ] Parse `dsq` messages
			- TODO
		- [ ] Parse `dss` messages
			- TODO
		- [ ] Parse `dsf` messages
			- TODO

# Demo
A demo at this point in time would be a bit too premature.

## Authentication to a Masternode
It's possible to run `node ./launcher.js` to see how the code connects to the Masternode of choice.
Be sure to fill out your `.config.json` with the correct info. 
Please note that `launcher.js` will spawn multiple instances of `demo.js`.
This is for the purpose of developing and testing `dsi` message transmission.

# Version
0.1.0
