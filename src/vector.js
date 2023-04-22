/**
 * A port of DASH core's CoinJoin client
 */

let Lib = {};

function create(){
	let vector = {
		contents: [],
		proto: {},
		get: function(){
			return vector.contents;
		},
		clear: function(_in_proto){
			vector.proto = _in_proto;
			vector.contents = [];
		},
			// FIXME : vector.js needs .erase()
		erase: function (start, end) {
			let saved = [];
			for(let i=0; i < vector.contents.length; ++i){
				if(i >= start && i < end){
					continue;
				}
				saved.push(vector.contents[i]);
			}
			vector.contents = saved;
		},
		size: function(){
			return vector.length;
		},
		emplace_back: function(...args) {
			vector.contents.push(vector.proto.create(...args));
		},
		push_back: function(...args) {
			vector.contents.push(vector.proto.create(...args));
		},
	};
}
module.exports = {
	create,
};
