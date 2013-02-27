var simpleserver 		= require('./simpleserver').simpleserver;
var simpleclient 		= require('./simpleclient').simpleclient;


function fleet() {
	this.colony = false;	// no colony yet
	this.port	= 0;		// port
	this.host	= "";		// Hostname
	this.max	= 2000;		// Max number of users per server. if more users connect, they will be sent to another serer instance.
	this.serverChangeRequests = {};	// used to track server change requests (when a server is full)
}
// Receiving daa from the Colony
fleet.prototype.onReceive = function(data) {
	if (data.available && data.available === true && !this.serverChangeRequests[data.uuid]) {
		this.log("Found a server:", data);
		// Save the fact that we just received an available server (so that other servers who aare available will be ignored, to not send the same user to more than one server. First to answer get the user.)
		this.serverChangeRequests[data.uuid] = data;
		this.server.send(data.uuid, {
			serverchange:	{
				host:	data.host,
				port:	data.port
			}
		});
	}
};
fleet.prototype.init = function() {
	var scope = this;
	if (!this.colony) {
		this.log("You are not part of a colony yet");
		return false;
	}
	
	// Tell the colony what is the max number of users we can accept
	this.colony.max = this.max;
	
	this.log("Starting server on port "+this.port);
	
	// Share the number of online users
	this.onlineCount	= this.colony.share("online", 0);
	if (this.onlineCount === false) {
		this.onlineCount	= this.colony.shared["online"];
		this.log("We already have this var in memory: ",this.onlineCount.value);
	}
	
	this.server = new simpleserver(this.port, {
		alias:		"SERVER@FLEET:"+this.port,	// To display on the console
		onConnect:	function(client) {
			scope.log("Connected.","Client ID:" + client.uid, "Online on this instance:" + scope.server.ocount);
			
			// Save the current number of online user.
			// The Entity needs to be able to know how many users are online, to know if it can volunteer to receive more users.
			scope.colony.ocount = scope.server.ocount;
			
			// Update the shared memory (total number of online users accross the colony)
			scope.onlineCount.add(1);
			
			// Check if there is still place on this server
			if (scope.server.ocount > scope.max) {
				scope.log("Max number of users reached. Sending user to another server...");
				// Tell the rest of the colony we are full. Any available entity will volunteer to receive the user.
				scope.colony.broadcast({
					full:	true,
					uuid:	client.uid	// sending the user's UUIDv4, to know who is available for him
				});
				return true;
			}
			
			// Send auth request: Auth and update on the number of users online
			scope.server.send(client.uid, [
				"auth",
				{
					online:	scope.onlineCount.value
				}
			]);
		},
		onReceive:	function(client, data) {
			scope.log("Message from #"+client.uid+":", data);
			switch (data) {
				default:
					if (data.auth) {
						// If the user provides an authtoken
						if (data.auth.authtoken) {
							// Save the authtoken
							client.authtoken	= data.auth.authtoken;
							// Send to the client his UID (UUIDv4)
							scope.server.send(client.uid, {
								uid:		client.uid
							});
							// Broadcast the updated number of online users
							scope.server.broadcast({
								online:		scope.onlineCount.value
							}, [client.uid]);
						}
					}
					if (data.available && data.available === true) {
						if (data.uuid = client.uid) {
							// this is for us
							
						}
					}
				break;
			}
		},
		onQuit:	function(client) {
			scope.log("Client Quit:", client.uid);
			scope.onlineCount.substract(1);
			scope.server.broadcast({
				online:		scope.onlineCount.value
			});
			// Save the current number of online user.
			// The Entity needs to be able to know how many users are online, to know if it can volunteer to receive more users.
			scope.colony.ocount = scope.server.ocount;
		}
	});
};
fleet.prototype.log = function(){
	var red, blue, reset;
	red   	= '\u001b[31m';
	blue  	= '\u001b[34m';
	green  	= '\u001b[32m';
	reset 	= '\u001b[0m';
	console.log(green+"<FLEET>");
	for (i in arguments) {
		console.log(reset, arguments[i],reset);
	}
};


exports.fleet = fleet;