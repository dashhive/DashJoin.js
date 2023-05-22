# DashJoin.js
A non-custodial server-side SDK that allows users to mix using DASH's CoinJoin feature.

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
	- [ ] Transaction encoding
		- Status: *IN PROGRESS*
		- Overview: A partial implementation of a Transaction is working on a fundamental level. Encoding the transaction for the purpose of creating a collateral transaction is the priority right now.
		- [ ] Craft a collateral transaction from user input
			- [ ] Place the encoded raw transaction into the `dsa` message
				- See: (DASH `dsa` docs)[https://docs.dash.org/projects/core/en/stable/docs/reference/p2p-network-privatesend-messages.html#dsa]
			
	- [ ] Transmitting CoinJoin to a Masternode
		- Status: *IN PROGRESS*
		- Overview: `dsa` message is very close to being correct
		- [ ] Send `dsa` message
			- [ ] Craft a `dsa` message
				- [x] Encode collateral transactions
					- [x] Encode a single `vin` (transaction input hash - or: "outpoint")
					- [x] Create raw transaction header with this encoded `vin`
				- [ ] Transmit collateral transactions
			- notes: dsa packet structure is correct, collateral tx is *ALMOST THERE*
		- [ ] Parse `dssu` messages
			- Overview: Generic parsing of `dssu` works, but will need to identify other types of dssu packets. In addition, the dssu packet will likely affect logic moving forward based on things like the Message ID and Pool Status/Pool Status Update fields.
			- [x] Basic parsing of `dssu`
			- [x] Recognizing and translating opcodes to string equivalents
				- for things like pool status update, message ID, etc
			- [ ] Handle all message ID response codes
			- [ ] Handle all Pool State response codes
			- [ ] Handle all Pool Status Update response codes
		- [ ] Parse `dsc` messages
			- TODO
		- [ ] Parse `dsi` messages
			- TODO
		- [ ] Parse `dsq` messages
			- TODO
		- [ ] Parse `dss` messages
			- TODO
		- [ ] Parse `dsf` messages
			- TODO

# Demo
Below are instructions on what can be demo'd.

## Authentication to a Masternode
It's possible to run `node ./network-authentication.js` to see how the code connects to the Masternode of choice.
Be sure to fill out your `.config.json` with the correct info.

# Version
0.0.1

## How version numbers work
Each number (separated by a dot) starting from the left to right:
1. If zero, there has been no official release of the code. 
	- If not zero, then this is the current version of the code and it has been released to the public and should be available for public use. 
	- If 2. is non-zero, 2. acts as a minor version.
2. If non-zero, and 1. is zero, then this is the alpha stage. 
	- If 1. is non-zero and 2. is non-zero, then 2. acts as a minor version while 1. acts a major version and 3. is ignored.
3. If non-zero, and both 1. and 2. are both zeroes, then the code is in beta stage. 
	- If 1. and 2. are non-zero, 3. should be ignored.
Each increment of 1. will most likely have breaking changes. Bug fixes and minor features will cause 2. to be incremented. You can think of 1. as being the release version and 2. as the bug/security fix/update counter.
