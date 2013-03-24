var simpleserver 	= require('./simpleserver').simpleserver;
var _ 				= require('underscore');

function chatserver(sqlInstance) {
	this.port 	= 8070;
	this.users 	= {};
	this.alias 	= "SERVER@CHAT:"+this.port;
	this.sql 	= sqlInstance;
}
chatserver.prototype.init = function() {
	var scope = this;
	
	this.server = new simpleserver(this.port, {
		alias:		"SERVER@CHAT:"+this.port,	// To display on the console
		onConnect:	function(client) {
			scope.log("Connected.","Client ID:" + client.uid, "Online on this instance:" + scope.server.ocount);
			
			// Send auth request: Auth and update on the number of users online
			scope.server.send(client.uid, [
				"auth"
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
							// Check Auth Token validity in the database
							// {"auth":{"authtoken":"a2b8cc905c56f09007177b5df8f00e44"}}
							scope.sql.query("select t.id,t.validity,t.token,t.uid,u.firstname,u.lastname,u.avatar_small from authtokens as t, users as u where u.id=t.uid and t.token='"+client.authtoken+"' and t.validity > "+(new Date().getTime()/1000), function(err, rows, fields) {
								if (err) throw err;
								if (rows.length > 0 && rows[0].id > 0) {
									scope.log("Auth Token validated: ","UID: \t\t"+rows[0].uid,"Token: \t"+rows[0].token,"Validity: \t"+new Date(rows[0].validity*1000).toISOString());
									
									// Register the user
									scope.users[client.uid] = {
										token:		client.uid,
										uid:		rows[0].uid,
										authtoken:	rows[0].token,
										validity:	rows[0].validity,
										name:		rows[0].firstname,
										avatar:		rows[0].avatar_small
									};
									
									// Share the user with all clients
									scope.server.broadcast({
										online:		scope.server.ocount,
										newuser:	scope.users[client.uid]
									}, [client.uid]);
									
									// Welcome the user
									scope.server.send(client.uid, {
										message:	"Welcome "+scope.users[client.uid].name+"!",
										from:		"Entity",
										identity:	scope.users[client.uid],
										users:		scope.users
									});
									
									
								} else {
									// Send the 'invalid_token' error to the user
									scope.server.send(client.uid, {
										invalid_token:		client.authtoken
									});
								}
							});
							
						}
					}
					if (data.message) {
						if (scope.users[client.uid]) {
							scope.server.broadcast({
								message:	data.message,
								from:		client.uid
							}, []);
						}
					}
					if (data.sysmessage) {
						if (scope.users[client.uid]) {
							scope.server.broadcast({
								sysmessage:	data.sysmessage,
								from:		client.uid
							}, []);
						}
						
					}
				break;
			}
		},
		onQuit:	function(client) {
			scope.log("Client Quit:", client.uid);
			// remove the user from the list
			delete scope.users[client.uid];
			
			scope.server.broadcast({
				quit:		client.uid,
				online:		scope.server.ocount
			});
			
		}
	});
}
chatserver.prototype.log = function(data) {
	var red, blue, reset;
	red   = '\u001b[35m';
	blue  = '\u001b[34m';
	reset = '\u001b[0m';
	console.log(red+"<"+this.alias+">");
	for (i in arguments) {
		console.log(reset, arguments[i],reset);
	}
}

exports.chatserver = chatserver;