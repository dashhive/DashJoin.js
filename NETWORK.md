# How a successful `version` initiation looks like
The first step in authenticating with a master node is by sending a `version` packet.
The master node should respond with `sendaddrv2` and a `verack`.
On the masternode side of things, the output should look like this:

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

Obviously, your exact `dash-cli` invocation will have more parameters. Fill them in where needed.


## How to tell if the `version` packet was parsed correctly

The masternode should output something like this:
```
2023-04-29T13:14:19Z received: version (118 bytes) peer=9
```

If you get something along the lines of `CDataStream::read(): end of data`
Or something about reading a packet that ended too early, then
that usually means you built the packet wrong. This could be a few things,
but verify the integrity of your packet.

The following lines represent the second step in the masternode authentication
process. The masternode will parse your `version` packet, then respond with it's
own `version` packet. In addition to sending it's `version` packet, it will send
a `verack` and a `sendaddrv2` packet.

If you specified a `mnauth_challenge` field when you built your `version` packet,
then you should see the response to that in the masternode's `verack` packet.
```
2023-04-29T13:14:19Z sending version (137 bytes) peer=9
2023-04-29T13:14:19Z send version message: version 70227, blocks=326620, us=[::]:0, them=[::]:0, peer=9
2023-04-29T13:14:19Z sending sendaddrv2 (0 bytes) peer=9
2023-04-29T13:14:19Z sending verack (0 bytes) peer=9
2023-04-29T13:14:19Z receive version message: : version 70227, blocks=89245, us=[0:1::]:19999, peer=9, peeraddr=127.0.0.1:50710
2023-04-29T13:14:21Z socket closed for peer=9
```

# TODO: capture and parse MN's `version` packet
- [ ] Write a function to accept a `Uint8Array` of bytes from the master node

# TODO: capture and parse MN's `verack` packet
- [ ] Write a function to parse the master node's `verack` packet
- [ ] If the user specified `mnauth_challenge`, verify that the `verack` contains the correct value
	- This might be phrased wrong. But the general idea is that the `mnauth_challenge` is usually responded to by the MN with it's own value. You'll have to look at the docs to see the exact mechanism to verify it is valid.

# TODO: capture and parse MN's `sendaddrv2` packet
- [ ] Write a function to parse the master node's `sendaddrv2` packet
- [ ] Write a function to respond to `sendaddrv2`

# Notes on connection lifetimes
From what I can tell, if you send your side of the handshake (the `version` packet) and just let the program sit there without sending or receiving any data on the socket, then the connection will stay open. There currently isn't any logic to abort as it's very early in the development cycle. At some point the library may implement an event listener interface to allow calling code to have a bit more control over data flows.

# Notes on Endian-ness
In the documentation, you'll see that different messages and different fields will contain phrases like "in *big endian order*". The library handles the conversion to network byte order, so please _DO NOT_ convert your parameters to any specific endian-ness. The library will take care of that for you.

# What we know about the handshake so far
The process seems to be:

1. Client sends `version` to MN
2. MN responds with `version`, `verack`, `sendaddrv2`
3. ???
4. -- end of authentication --

Step 3 to be determined soon.

