'use strict';

let DotEnv = window.ENV || require('dotenv');
if (DotEnv.config) {
	void DotEnv.config({ path: '.env' });
	void DotEnv.config({ path: '.env.secret' });
}

Object.assign(module.exports, process.env);
Object.assign(module.exports, {
	DASH_WALLET_SALT: process.argv[2] || '',
});
