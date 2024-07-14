var ENV;

(function () {
	'use strict';

	ENV = {
		// regtest=<see ~/.dashmate/local_seed/core/dash.conf>
		DASHD_RPC_USER: 'abcd1234',
		DASHD_RPC_PASS: '123456789012',
		DASHD_RPC_PASSWORD: '123456789012',
		DASHD_RPC_PROTOCOL: 'http',
		DASHD_RPC_HOST: 'localhost',
		// mainnet=9998, testnet=19998, regtest=<see ~/.dashmate/local_seed/core/dash.conf>
		DASHD_RPC_PORT: '8080',
		DASHD_RPC_TIMEOUT: '10.0',
		DASHD_TCP_WS_URL: 'ws://localhost:8080/tcp',
		// Generate this from
		//     npx -p dashphrase-cli -- dashphrase gen --bits 128 -o ./words.txt
		//     npx -p dashphrase-cli -- dashphrase seed ./words.txt "" -o ./seed.hex
		DASH_WALLET_PHRASE: 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong',
		//DASH_WALLET_SALT: 'TREZOR',
		DASH_WALLET_SEED:
			'ac27495480225222079d7be181583751e86f571027b0497b5b5d11218e0a8a13332572917f0f8e5a589620c6f15b11c61dee327651a14c34e18231052e48c069',
		package: {
			version: '1.0.0',
		},
	};
})();
