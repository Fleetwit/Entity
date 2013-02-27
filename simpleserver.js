var WebSocketServer 	= require('ws').Server;
var uuid 				= require('./uuid');

function simpleserver(port, options) {
	var scope 				= this;
	this.port 				= port;
	this.wss 				= new WebSocketServer({port: this.port});

	this.users				= {};
	this.count				= 0;	// Total number of connections, open or closed
	this.ocount				= 0;	// Total number of identified users
	
	this.alias				= "SERVER";
	if (options.alias) {
		this.alias			= options.alias;
	}
	
	this._version			= "1.0.0";
	
	this.options			= options;
	
	this.log("UUID", uuid.v4());
	
	this.log("version "+this._version);
	this.log("running on port "+this.port);
	this.wss.on('connection', function(ws) {
		
		var uid 	= scope.onConnect(ws);
		
		// uid is a UUID@v4
		//var uid 	= uuid.v4(); //scope.count;
		
		ws.on('message', function(message) {
			scope.onReceive(ws, uid, scope.wsdecode(message));
		});
		
		ws.on('close', function(code, message) {
			scope.onClose(ws, uid, message);
		});
		ws.on('error', function(code, message) {
			scope.log("error");
		});
	});
}



/****************
	ON CONNECT
****************/
simpleserver.prototype.onConnect = function(ws) {
	this.count++;
	this.ocount++;
	
	var uid 	= uuid.v4(); //this.count;	//  internal uid
	
	this.users[uid]	= {
		ws:		ws
	};
	
	this.log("Incoming connection (#"+uid+")");
	this.log(this.ocount+" users online");
	this.options.onConnect({
		ws:		ws,
		uid:	uid
	});
	
	return uid;
}




/****************
	ON RECEIVE
****************/
simpleserver.prototype.onReceive = function(ws, uid, message) {
	this.options.onReceive({
		ws:		ws,
		uid:	uid
	}, message);
}



/****************
	ON CLOSE
****************/
simpleserver.prototype.onClose  = function(ws, uid, message) {
	this.ccount--;
	this.ocount--;
	
	delete this.users[uid];
	
	this.log("#"+uid+" quit.");
	this.log(this.ocount+" users online");
	this.options.onQuit({
		ws:		ws,
		uid:	uid
	});
}





/****************
	WS:SEND
****************/
simpleserver.prototype.send = function(uid, data) {
	this.log("Sending to "+uid, data);
	this.users[uid].ws.send(this.wsencode(data));
}




/****************
	WS:BROADCAST
****************/
simpleserver.prototype.broadcast = function(data, except) {
	this.log("Broadcasting ", data);
	var i;
	var j;
	var l;
	// make the list
	var list = {};
	if (except != undefined && except.length > 0) {
		// clone the user list
		for(var keys = Object.keys(this.users), l = keys.length; l; --l) {
			list[ keys[l-1] ] = this.users[ keys[l-1] ];
		}
		// remove the exceptions
		l = except.length;
		for (j=0;j<l;j++) {
			delete list[except[j]];
		}
	} else {
		list = this.users;
	}
	// broadcast
	for (i in list) {
		list[i].ws.send(this.wsencode(data));
	}
	
}


simpleserver.prototype.log = function(data, data2) {
	var red, blue, reset;
	red   = '\u001b[31m';
	blue  = '\u001b[34m';
	reset = '\u001b[0m';
	console.log(red+"<"+this.alias+">");
	for (i in arguments) {
		console.log(reset, arguments[i],reset);
	}
}
simpleserver.prototype.wsencode = function(data) {
	return JSON.stringify(data);
}
simpleserver.prototype.wsdecode = function(data) {
	try {
		return JSON.parse(data);
	} catch (e) {
		this.log("Non encoded data: ",data);
		return data;
	}
}

exports.simpleserver = simpleserver;