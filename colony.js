var wssServer 		= require('ws').Server;
var wssClient 		= require('ws');
var sys 			= require('sys');
var _ 				= require('underscore');
var net 			= require('net');
var os 				= require('os');
var simpleserver 	= require('./simpleserver').simpleserver;
var simpleclient 	= require('./simpleclient').simpleclient;

/*
	search for a colony member
	if found
		request the entity's addresses
			Create alphaComm on a free slot
		request the alpha's address
			connect to the alpha (betaComm)
				request shared vars
				share our address
	if not found
		Setup alphaComm on the first spot available
		
*/

function colony(options) {
	this.options 	= options;
	this.host		= findServerIP();
	this.hosts		= ["localhost"];
	this.range 		= [8080,8090];
	this.shared		= {};
	this.alpha		= false;
	this.log("Online on "+this.host);
}
colony.prototype.log = function(){
	var red, blue, reset;
	red   = '\u001b[31m';
	blue  = '\u001b[34m';
	reset = '\u001b[0m';
	console.log(red+"<COLONY>");
	for (i in arguments) {
		console.log(reset, arguments[i],reset);
	}
};
colony.prototype.error = function(){
	var red, blue, reset;
	red   = '\u001b[31m';
	blue  = '\u001b[34m';
	reset = '\u001b[0m';
	console.log(red+"<COLONY>");
	for (i in arguments) {
		console.log(red,arguments[i],reset);
	}
};
colony.prototype.info = function(){
	var red, blue, reset;
	red   = '\u001b[31m';
	blue  = '\u001b[34m';
	reset = '\u001b[0m';
	console.log(red+"<COLONY>");
	for (i in arguments) {
		console.log(blue,arguments[i],reset);
	}
};
colony.prototype.connect = function(){
	// Find the colony
	this.map();
};
// Map the colony
colony.prototype.map = function(){
	var i;
	var j;
	var r = 0;
	var scope = this;
	this.colonymap = [];
	// We generate the list of possible entity addresses
	for (i=0;i<this.hosts.length;i++) {
		for (j=this.range[0];j<=this.range[this.range.length-1];j++) {
			r++;
			this.colonymap.push({
				rank:	r,
				host: 	this.hosts[i],
				port:	j,
				uuid:	this.hosts[i]+":"+j,
				online:	false,
				alpha:	false
			});
		}
	}
	this.l = this.colonymap.length;
	this.c = 0;
	// We'll try to connect to all the possible entities, to check who is online and who is offline
	// Then we call onMap()
	var probes = {};
	for (i=0;i<this.l;i++) {
		(function() {
			var n = i;
			probes[scope.colonymap[n].uuid] = new simpleclient(scope.colonymap[n].host,scope.colonymap[n].port,{
				onConnect:	function(instance) {
					scope.colonymap[n].online = true;
					scope.log(scope.colonymap[n].uuid+" is online.");
					scope.c++;
					instance.send("alpha?");
					if (scope.c == scope.l) {
						scope.onMap();
					}
				},
				onFail:	function(instance) {
					scope.colonymap[n].online = false;
					scope.log(scope.colonymap[n].uuid+" is offline.");
					scope.c++;
					instance.close();	// close the connection
					if (scope.c == scope.l) {
						scope.onMap();
					}
				},
				onReceive:	function(instance, message) {
					scope.log("Message received from "+scope.colonymap[n].uuid+": ",message);
					if (message == "yes") {
						scope.info(scope.colonymap[n].uuid+" is the alpha");
						scope.colonymap[n].alpha = true;
					}
					instance.close();	// close the connection
				}
			});
		})();
	}
};
// Called when the colony is mapped
colony.prototype.onMap = function(){
	var i;
	var j;
	var r = 0;
	// How many entities are online?
	var online = 0;
	for (i=0;i<this.l;i++) {
		if (this.colonymap[i].online == true) {
			online++;
		}
	}
	this.log(online+" entities online");
	if (online == 0) {
		this.log("We are the Alpha entity.");
		this.alpha = true;
	}
	// search for an available spot to setup our server
	for (i=0;i<this.l;i++) {
		if (this.colonymap[i].host == this.host) {
			/*for (j=this.range[0];j<=this.range[this.range.length-1];j++) {
				r++;
				if (this.colonymap[i].port == j && this.colonymap[i].online == false) {
					// we found an available port
					this.rank = r;
					this.log("Available spot on "+this.host+":"+j+" (rank #"+r+")");
					this.setupServer(j);
					return j;
				}
			}*/
			if (this.colonymap[i].online == false) {
				// we found an available port
				this.rank = i;
				this.log("Available spot on "+this.host+":"+this.colonymap[i].port+" (rank #"+i+")");
				this.setupServer(this.colonymap[i].port);
				return j;
			}
		}
	}
	// if we get to this point in the code, then there was no available slot to create a new server
	this.error("No available slot found. Server can't be created.");
	process.exit(1);
};
// Setup the server and client
colony.prototype.setupServer = function(port){
	this.port 		= port;
	var scope 		= this;
	this.server 	= new simpleserver(this.port, {
		onConnect:	function(client) {
			scope.log("Client ID:", client.uid);
		},
		onReceive:	function(client, data) {
			scope.log("Message from #"+client.uid+":", data);
			switch (data) {
				// Client asking if we are the alpha
				case "alpha?":
					scope.server.send(client.uid, scope.alpha?"yes":"no");
				break;
				// Client asking for the UID
				case "uid":
					scope.server.send(client.uid, {
						uid: client.uid
					});
				break;
				// Client asking to join the colony
				case "join":
					var i;
					var output = {};
					for (i in scope.shared) {
						output[i] = scope.shared[i].value;
					}
					scope.server.send(client.uid, {
						welcome:	true,
						shared:		output	// Sending the shared variables so that the entity can be up to date
					});
				break;
				default:
					// broadcast request
					if (data.broadcast) {
						scope.server.broadcast(data.broadcast, data.except);
					}
				break;
			}
		},
		onQuit:	function(client) {
			scope.log("Client Quit:", client.uid);
			if (scope.alpha) {
				// find the dead entity and remove it from the entity array
				var deadEntity = scope.getEntity("uid", client.uid);
				if (deadEntity !== false) {
					scope.shared["entities"].remove(deadEntity.index);
				}
				scope.log("Dead Entity",deadEntity);
			}
		}
	});
	// Our server is created.
	// Now we need to join the colony
	// We'll join the Alpha and tell him we want to join.
	
	if (this.alpha) {
		// We are the alpha, and the server is created
		
		// setup shared variables
		this.share("entities", []);
		/*this.nobroadcast();
		this.shared["entities"].push({
			host:	this.host,
			port:	this.port,
			uuid:	this.host+":"+this.port
		});*/
	}
	// setup the client
	this.setupClient();
};

colony.prototype.setupClient = function(host, port){
	var scope 		= this;
	// handle defaults, to be able to change the alpha's address if we want
	if (!host) {
		host = scope.getAlpha().host;
	}
	if (!port) {
		port = scope.getAlpha().port;
	}
	this.client = new simpleclient(host,port,{
		onConnect:	function(instance) {
			// We are now connected to the alpha.
			// Asking for our UID
			instance.send("uid");
			
		},
		onFail:	function(instance) {
			
		},
		onClose:	function(instance, code) {
			scope.error("Alpha is dead");
			// find the new alpha, based on rank
			if (scope.shared["entities"].value.length > 1) {	// making sure we're not the only one left here
				var deadAlpha 	= scope.getMinBut(scope.shared["entities"].value, "rank", false);
				var newAlpha 	= scope.getMinBut(scope.shared["entities"].value, "rank", deadAlpha.data.rank).data;  //scope.shared["entities"].at(1);
				scope.log("Dead alpha:", deadAlpha);
				scope.log("New alpha:", newAlpha);
				
				scope.log("##", newAlpha.uuid,scope.uuid);
				if (newAlpha.uuid == scope.uuid) {
					scope.info("We are the new alpha.");
					scope.alpha = true;
					// empty the list of entities locally. We will rebuild it completely.
					//scope.shared["entities"].value = new Array();
					scope.share("entities", []);
					// connect to the server now
					scope.setupClient(newAlpha.host, newAlpha.port);
				} else {
					scope.info("We are *NOT* the new alpha.");
					// connect to the client after one second
					setTimeout(function() {
						scope.setupClient(newAlpha.host, newAlpha.port);
					}, 1000);
				}
				
				
			} else {
				scope.info("We are the only entity left online");
			}
		},
		onReceive:	function(instance, message) {
			//scope.log("Receiving", "type("+typeof message+")",message);
			// uid
			if (message.uid) {
				scope.client_uid = message.uid;
				// ask to join the colony
				instance.send("join");
			}
			// Welcome message
			if (message.welcome) {
				// Get the shared variables (shared memory)
				for (i in message.shared) {
					scope.share(i, message.shared[i]);
				}
				// register ourselves into the list of entities
				scope.uuid = scope.host+":"+scope.port;
				scope.shared["entities"].push({
					rank:	scope.rank,
					uid:	scope.client_uid,
					host:	scope.host,
					port:	scope.port,
					uuid:	scope.host+":"+scope.port
				});
			}
			// Shared memory update
			if (message.share && message.share.from != scope.uuid) {
				scope.log("Executing :: scope.shared["+message.share.label+"]."+message.share.type+"(",message.share.data,")");
				scope.nobroadcast(); // turn off the broadcasting of the method for the next call (else it does an infinite broadcast loop)
				scope.shared[message.share.label][message.share.type](message.share.data);
				scope.info("scope.shared["+message.share.label+"] is now: ",scope.shared[message.share.label].value);
			}
		}
	});
};


colony.prototype.nobroadcast = function(){
	this.skipBroadcast = true;
};
// Get an entity ref (from the entities found by scanning)
colony.prototype.getDetectedEntity = function(prop, val){
	var i;
	for (i=0;i<this.l;i++) {
		if (this.colonymap[i][prop] == val) {
			return this.colonymap[i];
		}
	}
};
// Get an entity ref (from the entities in the colony)
colony.prototype.getEntity = function(prop, val){
	var i;
	for (i=0;i<this.shared["entities"].value.length;i++) {
		console.log("-->",this.shared["entities"].value[i]);
		if (this.shared["entities"].value[i][prop] == val) {
			return {
				index:	i,
				value:	this.shared["entities"].value[i]
			};
		}
	}
	return false;
};
colony.prototype.getAlpha = function(){
	var i;
	for (i=0;i<this.l;i++) {
		if (this.colonymap[i].alpha == true) {
			return this.colonymap[i];
		}
	}
	return this.colonymap[0];
};
// get minimum which isn't a particular value
colony.prototype.getMinBut = function(data, prop, except){
	//this.log("*** getMinBut() ***",data, prop, except);
	var i;
	var index;
	var min = 1000000000;
	for (i=0;i<data.length;i++) {
		if (data[i][prop] <= min && data[i][prop] !== except) {
			min 	= data[i][prop];
			index 	= i;
		}
	}
	return {
		index:	index,
		min:	min,
		data:	data[index]
	}
};



// share data with the colony
colony.prototype.share = function(label, data){
	if (data instanceof Array) {
		this.shared[label] = new sharedArray(this, label, data);
		this.shared[label].log(label,"data type Array",data);
	} else if (data instanceof Object) {
		this.shared[label] = new sharedObject(this, label, data);
		this.shared[label].log(label,"data type Object",data);
	} else if (typeof data == "string") {
		this.shared[label] = new sharedString(this, label, data);
		this.shared[label].log(label,"data type String",data);
	} else if (typeof data == "number") {
		this.shared[label] = new sharedNumber(this, label, data);
		this.shared[label].log(label,"data type Number",data);
	} else {
		console.log(label,"data type Unknown ("+(typeof data)+")",data);
	}
	return this.shared[label];
}


colony.prototype.sharedExport = function(){
	var i;
	var output = {};
	for (i in this.shared) {
		output[i] = this.shared[i].value;
	}
	return output;
}
colony.prototype.broadcast = function(data){
	if (this.skipBroadcast) {
		this.skipBroadcast = false;
		return false;
	}
	if (this.alpha) {
		this.server.broadcast(data);
	} else {
		this.client.send({
			broadcast:	data,
			except:		[this.client_uid]
		});
	}
}




/*************
* SHAREDARRAY
*************/
function sharedArray(instance, label, value) {
	this.colony = instance;
	this.label 	= label;
	this.value 	= value.splice(0,value.length);
}
sharedArray.prototype.send = function(type,data) {
	this.colony.broadcast({
		share:{
			type:	type,
			label:	this.label,
			data:	data,
			from:	this.colony.uuid
		}
	});
};
sharedArray.prototype.push = function(data) {
	this.value.push(data);
	this.send("push", data);
	return this.value;
};
sharedArray.prototype.remove = function(index) {
	this.value.splice(index,1);
	this.send("remove", index);
	return this.value;
};
sharedArray.prototype.at = function(index) {
	return this.value[index];
};
sharedArray.prototype.replace = function(value) {
	this.value = value.splice(0,value.length);
	return this.value;
};
sharedArray.prototype.log = function(){
	var red, blue, reset;
	red   = '\u001b[31m';
	blue  = '\u001b[34m';
	reset = '\u001b[0m';
	console.log(red+"<sharedArray>");
	for (i in arguments) {
		console.log(reset, arguments[i],reset);
	}
};





/*************
* SHAREDOBJECT
*************/
function sharedObject(instance, label, value) {
	this.colony = instance;
	this.label 	= label;
	this.value 	= _.extend({},value);
}
sharedObject.prototype.send = function(type,data) {
	this.colony.broadcast({
		share:{
			type:	type,
			label:	this.label,
			data:	data,
			from:	this.colony.uuid
		}
	});
};
sharedObject.prototype.at = function(index) {
	return this.value[index];
};
sharedObject.prototype.set = function(opt) {
	this.value[opt.label] = opt.value;
	this.send("set", opt);
	return this.value;
};
sharedObject.prototype.replace = function(value) {
	this.value = _.extend({},value);
	return this.value;
};
sharedObject.prototype.log = function(){
	var red, blue, reset;
	red   = '\u001b[31m';
	blue  = '\u001b[34m';
	reset = '\u001b[0m';
	console.log(red+"<sharedObject>");
	for (i in arguments) {
		console.log(reset, arguments[i],reset);
	}
};





/*************
* SHAREDSTRING
*************/
function sharedString(instance, label, value) {
	this.colony = instance;
	this.label 	= label;
	this.value 	= value.toString();
}
sharedString.prototype.send = function(type,data) {
	this.colony.broadcast({
		share:{
			type:	type,
			label:	this.label,
			data:	data,
			from:	this.colony.uuid
		}
	});
};
sharedString.prototype.val = function(value) {
	this.value = value.toString();
	this.send("val", value);
	return this.value;
};
sharedString.prototype.replace = function(value) {
	this.value = value.toString();
	return this.value;
};
sharedString.prototype.log = function(){
	var red, blue, reset;
	red   = '\u001b[31m';
	blue  = '\u001b[34m';
	reset = '\u001b[0m';
	console.log(red+"<sharedString>");
	for (i in arguments) {
		console.log(reset, arguments[i],reset);
	}
};





/*************
* SHAREDNUMBER
*************/
function sharedNumber(instance, label, value) {
	this.colony = instance;
	this.label 	= label;
	this.value 	= value*1;
}
sharedNumber.prototype.send = function(type,data) {
	this.colony.broadcast({
		share:{
			type:	type,
			label:	this.label,
			data:	data,
			from:	this.colony.uuid
		}
	});
};
sharedNumber.prototype.val = function(value) {
	this.value = value*1;
	this.send("val", value);
	return this.value;
};
sharedNumber.prototype.replace = function(value) {
	this.value = value*1;
	return this.value;
};
sharedNumber.prototype.log = function(){
	var red, blue, reset;
	red   = '\u001b[31m';
	blue  = '\u001b[34m';
	reset = '\u001b[0m';
	console.log(red+"<sharedNumber>");
	for (i in arguments) {
		console.log(reset, arguments[i],reset);
	}
};






function communication(instance,server, port, options){
	var scope		= this;
	this.colony 	= instance;
	this.server		= server;
	this.protocol	= new commProtocol(instance, this);
	this.port		= port;
	this.channels 	= {};
	this.clients	= {};
	this.count		= 0;
	this.messageCallback	= function(){};
	this.options	= _.extend({
		server:			false,
		onInit:			function(){},
		onFail:			function(code, message){},
		onReceive:		function(mesage){}
	}, options);
	
	if (this.options.server) {
		
		this.wss 		= new wssServer({port: port});
		this.wss.on('connection', function(ws) {
			var scope2 = scope;
			
			// Increment the unique client count
			scope.count++;
			
			// save it locally
			var cid 			= scope.count*1;
			
			// register the client
			scope.clients[cid]	= {ws:ws};
			
			scope.options.onInit(this);
			
			ws.on('message', function(message) {
				
				var parsed = scope.protocol.parse(message, ws);
				console.log(">>> parsed",message,parsed);
				if (!parsed) {
					scope2.messageCallback(comm_decode(message));
					scope2.options.onReceive(scope2, message);
				}
			});
			
			ws.on('close', function(code, message) {
				delete scope2.clients[cid];
			});
		});
	} else {
		this.wss 		= new wssClient("ws://"+server+":"+port);
		
		this.wss.on('open', function() {
			scope.options.onInit(scope);
		});
		this.wss.on('message', function(message) {
			scope.messageCallback(comm_decode(message));
			scope.options.onReceive(scope, message);
		});
		this.wss.on('error', function(message) {
			scope.options.onFail(scope, message);
		});
	}
}
communication.prototype.send = function(message){
	this.messageCallback = function(){};
	if (!this.options.server) {
		this.wss.send(comm_encode({
			send:message
		}));
	} else {
		console.log("communication.send() can only be used by clients, not servers", message);
	}
};
communication.prototype.broadcast = function(message){
	this.messageCallback = function(){};
	if (this.options.server) {
		for (j in this.clients) {
			this.clients[j].ws.send(comm_encode({
				send:message
			}));
		}
	} else {
		this.wss.send(comm_encode({
			broadcast:message
		}));
	}
};
communication.prototype.ask = function(message, callback){
	if (this.options.server) {
		console.log("communication.ask() can only be used by clients, not servers", message);
	} else {
		this.messageCallback = callback;
		// ask the server
		this.wss.send(comm_encode({
			ask:message
		}));
	}
};






function commProtocol(instance, commInstance) {
	this.colony = instance;
	this.comm	= commInstance;
}
commProtocol.prototype.parse = function(message, socket){
	var i;
	message = JSON.parse(message);
	if (message.ask) {
		switch (message.ask) {
			case "identity?":
				socket.send(comm_encode("Bourne, Jason."));
				socket.send(comm_encode("Bond, James Bond.."));
				// searching for a free spot
				return true;
				//this.colony.
			break;
			case "shared?":
				var i;
				var buffer = {};
				for (i in this.colony.shared) {
					buffer[i] = this.colony.shared[i].value;
				}
				socket.send(comm_encode(buffer));
				return true;
			break;
			case "alpha?":
				console.log("Asking if we are the alpha...");
				if (this.colony.alpha) {
					socket.send(comm_encode({
						alpha:"yes"
					}));
				} else {
					socket.send(comm_encode({
						alpha:"no" //this.colony.shared["clients"][0]
					}));
				}
				return true;
			break;
			default:
				socket.send(comm_encode("I can't understand"));
				return false;
			break;
		}
	}
	console.log("///////",message);
	if (message.broadcast) {
		console.log("Broadcast Request!",message.broadcast);
		this.comm.broadcast(message.broadcast);
	}
};



function comm_encode(data){
	return JSON.stringify(data);
}
function comm_decode(data){
	return JSON.parse(data);
}



function findServerIP() {
	return "localhost";
	var i;
	var interfaces = os.networkInterfaces();
	for(name in interfaces) {
		var interface = interfaces[name];
		for (i=0;i<interface.length;i++) {
			if(interface[i].family === 'IPv4') {
				console.log("interface",interface[i]);
				return interface[i].address;
			}
		}
	}
}

exports.colony = colony;