/**
 * A port of DASH core's COutPoint
 */

function COutPoint(_optional_prototype = null){
	this.contents = [];
	this.proto = _optional_prototype || {};
	let self = this;
	this.get = function(){
		return self.contents;
	};
	this.clear = function(_in_proto){
			self.proto = _in_proto;
			self.contents = [];
		};
	this.erase = function (start, end) {
			let saved = [];
			for(let i=0; i < self.contents.length; ++i){
				if(i >= start && i < end){
					continue;
				}
				saved.push(self.contents[i]);
			}
			self.contents = saved;
		};
		this.size = function(){
			return self.contents.length;
		};
		this.emplace_back = function(...args) {
			self.contents.push(self.proto.create(args));
		};
		this.push_back = function(...args) {
			self.contents.push(self.proto.create(...args));
		};
	this.create = (...args) => {
		console.debug('COutPoint create factory method');
	};
}
module.exports = COutPoint;
