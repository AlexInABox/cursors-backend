//Websocket server that receives live cursor position data from multiple clients that are connected to the same webpage

const WebSocket = require('ws');
const PORT = 2053;

const wss = new WebSocket.Server({ port: PORT }); //Running in a docker container this connection will be insecure (ws), until a reverse proxy is set up.
//                                                //In production this is the case. An apache reverse proxy is set up to point to this docker container wich is running on the very same machine.

var rooms = [
    ["google.com", /*{ id: "myid", ws: "ws1", skinId: "1" }, { id: "myid2", ws: "ws2", skinId: "0" }*/],
    ["wikipedia.com", /*{ id: "myid3", ws: "ws3", skinId: "0" }, { id: "myid4", ws: "ws4", skinId: "4" }*/]
]
/*
clients = {
    room1: {
        id1: ws1,
        id2: ws2,
        id3: ws3
    },
    room2: {
        id1: ws1
    },
    room3: {
        id1: ws1,
        id2: ws2
    }
}
*/


//when a new client connects
wss.on('connection', function (ws) {
    console.log("New client connected");
    //generate a unique id for the client
    var id = Math.random().toString(36).substr(2, 9);
    var ROOM;
    var ROOM_INDEX; //this requires that the rooms never change their index (never remove a room)
    var skinId;
    const MASTER_TIMEOUT_TIME = 1800000; //disconnect the client after 30 minutes of inactivity
    const INVISIBILITY_TIMEOUT_TIME = 300000; //announce the client as disconnected after 5 minutes of inactivity
    const INVISIBLE = false; //will be set to true when the client is announced as disconnected

    //start the master timeout´
    var MASTER_TIMEOUT = setTimeout(masterTimeout, MASTER_TIMEOUT_TIME);

    var INVISIBILITY_TIMEOUT = setTimeout(invisibilityTimeout, INVISIBILITY_TIMEOUT_TIME);


    //when the client sends the first login message
    ws.on('message', function (message) {

        //reset the master timeout
        resetMasterTimeout();

        //reset the invisibility timeout
        resetInvisibilityTimeout();

        var message;
        try { //if the message is not valid JSON then close the connection since the client is not following the protocol
            message = JSON.parse(message);
        } catch (e) {
            console.log(id + " sent an invalid message and was disconnected");
            ws.close(1003); //1003 = unsupported data
            return;
        }

        if (message.type == "login") {
            //parse the message
            ROOM = message.room;
            skinId = message.skinId || 0;

            //add the client into his room or create a new room if it doesn't exist already
            var roomExists = false;
            for (var i = 0; i < rooms.length; i++) {
                if (rooms[i][0] == ROOM) {
                    rooms[i].push({ id: id, ws: ws, skinId: skinId });
                    roomExists = true;
                    ROOM_INDEX = i;
                    break;
                }
            }
            if (!roomExists) {
                ROOM_INDEX = rooms.length;
                rooms.push([ROOM, { id: id, ws: ws, skinId: Number(skinId) }]);
                console.log("Created room " + ROOM);
                console.log(rooms);
            }

            //notify all clients in that room that a new client connected
            for (var i = 1; i < rooms[ROOM_INDEX].length; i++) { //start from 1 because the first element is the room name
                if (rooms[ROOM_INDEX][i].id != id) {
                    rooms[ROOM_INDEX][i].ws.send(JSON.stringify({ type: "connected", id: id, skinId: Number(skinId) }));
                }
            }

            //send the client a connected message for every client already in the room
            for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
                if (rooms[ROOM_INDEX][i].id != id) {
                    ws.send(JSON.stringify({ type: "connected", id: rooms[ROOM_INDEX][i].id, skinId: rooms[ROOM_INDEX][i].skinId }));
                }
            }
        } else if (message.type == "cursor-update") {
            //parse the message
            var x = message.x;
            var y = message.y;

            //notify all clients in that room that a new client moved his cursor
            for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
                if (rooms[ROOM_INDEX][i].id != id) {
                    rooms[ROOM_INDEX][i].ws.send(JSON.stringify({ type: "cursor-update", id: id, x: x, y: y }));
                }
            }

            //if the client was previously announced as disconnected (invisible) then announce him as connected again
            if (INVISIBLE) {
                console.log(id + " returned from invisibility");
                INVISIBLE = false;
                //notify all clients in that room that a "new" client connected
                for (var i = 1; i < rooms[ROOM_INDEX].length; i++) { //start from 1 because the first element is the room name
                    if (rooms[ROOM_INDEX][i].id != id) {
                        rooms[ROOM_INDEX][i].ws.send(JSON.stringify({ type: "connected", id: id, skinId: Number(skinId) }));
                    }
                }
            }
        } else if (message.type == "skin-update") {

        } else if (message.type == "keep-alive") {
            //this message is sent every 5 seconds by the chrome extension to keep chrome (or every other webbrowser) from suspending the websocket connection on the client side
        }
    });
    //when the client disconnects
    ws.on('close', function () {
        console.log(id + " disconnected");
        if (ROOM_INDEX) {
            //remove the client from the array
            for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
                if (rooms[ROOM_INDEX][i].id == id) {
                    rooms[ROOM_INDEX].splice(i, 1);
                    i--;
                }
            }
            //notify all clients in that room that the client disconnected
            for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
                rooms[ROOM_INDEX][i].ws.send(JSON.stringify({ type: "disconnected", id: id }));
            }
        }
        clearTimeout(MASTER_TIMEOUT);
        clearTimeout(INVISIBILITY_TIMEOUT);
    });
    //on timeout
    ws.on('timeout', function () {
        console.log(id + " timed out and was disconnected");
        if (ROOM_INDEX) {
            //remove the client from the array
            for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
                if (rooms[ROOM_INDEX][i].id == id) {
                    rooms[ROOM_INDEX].splice(i, 1);
                    i--;
                }
            }
            //notify all clients in that room that the client disconnected
            for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
                rooms[ROOM_INDEX][i].ws.send(JSON.stringify({ type: "disconnected", id: id }));
            }
        }
        clearTimeout(MASTER_TIMEOUT);
        clearTimeout(INVISIBILITY_TIMEOUT);
    });
    //on error
    ws.on('error', function () {
        console.log(id + " errored and was disconnected");
        if (ROOM_INDEX) {
            //remove the client from the array
            for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
                if (rooms[ROOM_INDEX][i].id == id) {
                    rooms[ROOM_INDEX].splice(i, 1);
                    i--;
                }
            }
            //notify all clients in that room that the client disconnected
            for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
                rooms[ROOM_INDEX][i].ws.send(JSON.stringify({ type: "disconnected", id: id }));
            }
        }
        clearTimeout(MASTER_TIMEOUT);
        clearTimeout(INVISIBILITY_TIMEOUT);
    });

    function masterTimeout() {
        console.log(id + " timed out and was disconnected");
        ws.close(1000); //1000 = normal closure
    }

    function resetMasterTimeout() {
        clearTimeout(MASTER_TIMEOUT);
        MASTER_TIMEOUT = setTimeout(masterTimeout, MASTER_TIMEOUT_TIME);
    }

    function invisibilityTimeout() {
        console.log(id + " was announced as disconnected and is now invisible");
        if (ROOM_INDEX) {
            //notify all clients in that room that the client disconnected
            for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
                rooms[ROOM_INDEX][i].ws.send(JSON.stringify({ type: "disconnected", id: id }));
            }
        }
        INVISIBLE = true;
    }

    function resetInvisibilityTimeout() {
        clearTimeout(INVISIBILITY_TIMEOUT);
        INVISIBILITY_TIMEOUT = setTimeout(invisibilityTimeout, INVISIBILITY_TIMEOUT_TIME);
    }
});

