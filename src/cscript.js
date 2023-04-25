/**
 * ATTN: this script is woefully incomplete!
 */
/** Serialized script, used inside transaction inputs and outputs */
//class CScript : public CScriptBase
function CScript(
  args = {
    int64In: null,
    opcodeIn: null,
    cScriptNum: null,
    cScript: null, // in the case of instantiating this with another CScript() object
  }
) {
  let self = this;
  this.constructorId = 0;
  this.vector_contents = [];
  this.push_back = function (input, type) {
    self.vector_contents.push({ value: input, type });
  };
  this.push_int64 = function (n) {
    if (n == -1 || (n >= 1 && n <= 16)) {
      self.push_back(n + (OP_1 - 1), "opcode");
    } else if (n == 0) {
      self.push_back(OP_0, "opcode");
    } else {
      self.push_back(n, "cscriptnum");
    }
  };
  this.clear = function () {
    self.vector_contents = [];
  };
  this.equals = function (other) {
    // FIXME: this probably isn't right
    return self.vector_contents === other.vector_contents;
  };
  this.ToHexStr = function () {
    function toHexString(byteArray) {
      return Array.from(byteArray, function (byte) {
        return ("0" + (byte & 0xff).toString(16)).slice(-2);
      }).join("");
    }
    return toHexString(self.vector_contents);
  };
  /**
	 * Support for constructor:
    explicit CScript(int64_t b) { operator<<(b); }
		*/
  if (null !== args.int64In) {
    self.push_back(args.int64In, "int64");
    this.constructorId = 1;
  }
  /**
	 * Support for constructor:
    explicit CScript(opcodetype b)     { operator<<(b); }
		*/
  if (null !== args.opcodeIn) {
    this.constructorId = 2;
    self.push_back(args.opcodeIn, "opcode");
  }
  /**
	 * Support for constructor:
    explicit CScript(const CScriptNum& b) { operator<<(b); }
 	*/
  if (null !== args.cScriptNum) {
    this.constructorId = 3;
    self.push_back(args.cScriptNum, "cscriptnum");
  }
}
