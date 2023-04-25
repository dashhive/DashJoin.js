/**
 * A port of DASH core's COutPoint
 */
/** An outpoint - a combination of a transaction hash and an index n into its vout */
//orig: uint32_t NULL_INDEX = std::numeric_limits<uint32_t>::max();
const NULL_INDEX = 0xffffffff;

function COutPoint(args = {
	hashIn: null,
	nIn: null,
}){
	let self = this;
  //orig: uint256 hash;
	this.hash = 0;
	this.n = NULL_INDEX;
	this.constructorId = 0;

    /**
		 * Support for default constructor:
		 * COutPoint(): n(NULL_INDEX) { }
		 */
	this.n = NULL_INDEX;
	this.constructorId = 1;
	
  /**
	 * Support for constructor:
	 * COutPoint(const uint256& hashIn, uint32_t nIn): hash(hashIn), n(nIn) { }
	 */
	if(null !== args.hashIn && null !== args.nIn){
		this.hash = args.hashIn;
		this.n = args.nIn;
		this.constructorId = 2;
	}

    this.SetNull = function() {
			self.hash = null;//.SetNull();
			self.n = NULL_INDEX;
		};

	this.IsNull = function(){
		return self.hash === null /*.IsNull()*/ && NULL_INDEX === self.n;
	};
	/**
	 * I'm leaving the implementation code here as it's not 
	 * incredibly straightforward.
	 * TODO: what is .Compare and it's internals?
	 */
//  friend bool operator<(const COutPoint& a, const COutPoint& b)
//    {
//        int cmp = a.hash.Compare(b.hash);
//        return cmp < 0 || (cmp == 0 && a.n < b.n);
//    }
//
	this.lessThan = function(b){
		// TODO: verify this
		//let cmp = self.hash.Compare(b.hash);
		//return cmp < 0 || (cmp == 0 && self.n.lessThan(b.n));
		return self.hash < b.hash || (self.hash === b.hash && self.n < b.n);
	};
	this.equals = function(b){
    return self.hash === b.hash && self.n === b.n;
  };

  this.ToString = function() {
		// TODO: maybe change this
		return JSON.stringify(self);
	};
  this.ToStringShort = function() {
		// TODO: maybe change this
		return JSON.stringify(self);
	};
};

module.exports = COutPoint;
