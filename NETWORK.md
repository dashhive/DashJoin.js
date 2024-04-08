# What we know about the handshake so far

The process seems to be:

1. Client sends `version` to MN
2. MN responds with `version`, `verack`, `sendaddrv2`
3. Client sends `verack` to the MN's `version` message
4. MN responds with:
   - `sendheaders`
   - `sendcmpct`
   - `senddsq`
   - `ping`
5. The client should then send `dsa` coin join message
   - Which includes valid collateral transaction
6. MN responds with `dssu` message Next steps are documented here:
   [CoinJoin Messages](https://docs.dash.org/projects/core/en/stable/docs/reference/p2p-network-privatesend-messages.html#dssu)

# How a `dsa` message looks (MN debug output):

```
2023-05-22T07:35:14Z DSACCEPT -- nDenom 16 (0.00100001)  txCollateral CMutableTransaction(hash=c9c0ae6e9d, ver=3, type=0, vin.size=1, vout.size=0, nLockTime=0, vExtraPayload.size=0)
    CTxIn(COutPoint(3f56f3009ef3c54bd5123e70c5a2c9be1b90a3fddb3589ce2d1b9688b0926c9f, 0), scriptSig=000000006b483045022100f4)
```

These exact values may need to change, but this is proof that the MN accepted
our dsa even if the outpoint or signature script is not exactly correct. The
goal here was to properly encode a `dsa` message. The packet is correctly
encoded.

# TODO: parse `dssu` message

- [ ] Write a function that parses the `dssu` message

# TODO: finalize `dsa` message logic

The `dsa` packet creation functions are now encoding the denomination and
collateral transaction correctly. We now need to:

- [ ] Verify the collateral transaction is properly encoded
      (`SHA256(SHA256(txn))`)
- [ ] Verify the signature script is correct

## Using dash core's `CCoinJoin::IsCollateralValid`

    - [ ] Add a `vout` to the `dsa` payload
    	- This seems to be *MANDATORY*

- [ ] Create several collateral transactions for demo purposes and testing
- [ ] Unit test the integrity of all fields within a transaction

# Notes on connection lifetimes

From what I can tell, if you send your side of the handshake (the `version`
packet) and just let the program sit there without sending or receiving any data
on the socket, then the connection will stay open. There currently isn't any
logic to abort as it's very early in the development cycle. At some point the
library may implement an event listener interface to allow calling code to have
a bit more control over data flows.

# Notes on Endian-ness

In the documentation, you'll see that different messages and different fields
will contain phrases like "in _big endian order_". The library handles the
conversion to network byte order, so please _DO NOT_ convert your parameters to
any specific endian-ness. The library will take care of that for you.

# How a successful `version` initiation looks like

The first step in authenticating with a master node is by sending a `version`
packet. The master node should respond with `sendaddrv2` and a `verack`. On the
masternode side of things, the output should look like this:

```
2023-04-29T13:14:19Z Added connection to 127.0.0.1:50710 peer=9
2023-04-29T13:14:19Z connection from 127.0.0.1:50710 accepted, sock=41, peer=9
2023-04-29T13:14:19Z received: version (118 bytes) peer=9
2023-04-29T13:14:19Z sending version (137 bytes) peer=9
2023-04-29T13:14:19Z send version message: version 70227, blocks=326620, us=[::]:0, them=[::]:0, peer=9
2023-04-29T13:14:19Z sending sendaddrv2 (0 bytes) peer=9
2023-04-29T13:14:19Z sending verack (0 bytes) peer=9
2023-04-29T13:14:19Z receive version message: : version 70227, blocks=89245, us=[0:1::]:19999, peer=9, peeraddr=127.0.0.1:50710
2023-04-29T13:14:21Z socket closed for peer=9
2023-04-29T13:14:21Z disconnecting peer=9
2023-04-29T13:14:21Z ThreadSocketHandler -- removing node: peer=9 addr=127.0.0.1:50710 nRefCount=1 fInbound=1 m_masternode_connection=0 m_masternode_iqr_connection=0
2023-04-29T13:14:21Z Cleared nodestate for peer=9
```

If your masternode doesn't print this, then use the RPC to set `debug` to `all`.
`dash-cli debug all`

Obviously, your exact `dash-cli` invocation will have more parameters. Fill them
in where needed.

## How to tell if the `version` packet was parsed correctly

The masternode should output something like this:

```
2023-04-29T13:14:19Z received: version (118 bytes) peer=9
```

If you get something along the lines of `CDataStream::read(): end of data` Or
something about reading a packet that ended too early, then that usually means
you built the packet wrong. This could be a few things, but verify the integrity
of your packet.

The following lines represent the second step in the masternode authentication
process. The masternode will parse your `version` packet, then respond with it's
own `version` packet. In addition to sending it's `version` packet, it will send
a `verack` and a `sendaddrv2` packet.

If you specified a `mnauth_challenge` field when you built your `version`
packet, then you should see the response to that in the masternode's `verack`
packet.

```
2023-04-29T13:14:19Z sending version (137 bytes) peer=9
2023-04-29T13:14:19Z send version message: version 70227, blocks=326620, us=[::]:0, them=[::]:0, peer=9
2023-04-29T13:14:19Z sending sendaddrv2 (0 bytes) peer=9
2023-04-29T13:14:19Z sending verack (0 bytes) peer=9
2023-04-29T13:14:19Z receive version message: : version 70227, blocks=89245, us=[0:1::]:19999, peer=9, peeraddr=127.0.0.1:50710
2023-04-29T13:14:21Z socket closed for peer=9
```

# Where we're at:

```
2023-05-24T07:58:40Z DSACCEPT --
	nDenom 16 (0.00100001) 				## CORRECT
	txCollateral CMutableTransaction(
		hash=30e5887f48, 						## UNKNOWN(??)
		ver=3,  										## CORRECT
		type=0,  										## CORRECT
		vin.size=1,  								## CORRECT
		vout.size=1,  							## CORRECT
		nLockTime=0,  							## CORRECT
		vExtraPayload.size=0 				## CORRECT
		)
    CTxIn(
			COutPoint(
			940effdb84072ff65c64c7d0446afcc3957569dbf058583ddd4f9586cf8a35b8, 0), ## [unknown,correct]
			scriptSig=000000006b483045022100f4)
    CTxOut(
				nValue=0.00000000,			## CORRECT
				scriptPubKey=6a)				## INVALID

2023-05-24T07:58:40Z sending dssu (16 bytes) peer=19
```
