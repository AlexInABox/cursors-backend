//Websocket server that receives live cursor position data from multiple clients that are connected to the same webpage

const https = require('https');
const WebSocket = require('ws');
const fs = require('fs');

const serverOptions = {
    cert: fs.readFileSync('./ssl/fullchain.pem'),
    key: fs.readFileSync('./ssl/privkey.pem')
};

const server = https.createServer(serverOptions);
const wss = new WebSocket.Server({ server });

const PORT = 2053;
server.listen(PORT, () => {
    console.log(`Secure WebSocket server is listening on port ${PORT}`);
});

var rooms = [
    ["google.com", /*{ id: "myid", ws: "ws1" }, { id: "myid2", ws: "ws2" }*/],
    ["wikipedia.com", /*{ id: "myid3", ws: "ws3" }, { id: "myid4", ws: "ws4" }*/]
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
    //generate a unique id for the client
    var id = Math.random().toString(36).substr(2, 9);
    var ROOM;
    var ROOM_INDEX; //this requires that the rooms never change their index (never remove a room)

    //when the client sends the first login message
    ws.on('message', function (message) {
        var message;
        try { //if the message is not valid JSON then close the connection since the client is not following the protocol
            message = JSON.parse(message);
        } catch (e) {
            console.log("Invalid JSON");
            ws.close(1003); //1003 = unsupported data
            return;
        }

        if (message.type == "login") {
            //parse the message
            ROOM = message.room;

            //add the client into his room or create a new room if it doesn't exist already
            var roomExists = false;
            for (var i = 0; i < rooms.length; i++) {
                if (rooms[i][0] == ROOM) {
                    rooms[i].push({ id: id, ws: ws });
                    roomExists = true;
                    ROOM_INDEX = i;
                    break;
                }
            }
            if (!roomExists) {
                ROOM_INDEX = rooms.length;
                rooms.push([ROOM, { id: id, ws: ws }]);
            }

            //notify all clients in that room that a new client connected
            for (var i = 1; i < rooms[ROOM_INDEX].length; i++) { //start from 1 because the first element is the room name
                if (rooms[ROOM_INDEX][i].id != id) {
                    rooms[ROOM_INDEX][i].ws.send(JSON.stringify({ type: "connected", id: id }));
                }
            }

            //send the client a connected message for every client already in the room
            for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
                if (rooms[ROOM_INDEX][i].id != id) {
                    ws.send(JSON.stringify({ type: "connected", id: rooms[ROOM_INDEX][i].id }));
                }
            }

            console.log(rooms);
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
        }
    });
    //when the client disconnects
    ws.on('close', function () {
        if (!ROOM_INDEX) return; //if the client didn't send a login message he never joined a room... so there's nothing to do
        //remove the client from the array
        for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
            if (rooms[ROOM_INDEX][i].id == id) {
                rooms[ROOM_INDEX].splice(i, 1);
            }
        }
        //notify all clients in that room that the client disconnected
        for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
            rooms[ROOM_INDEX][i].ws.send(JSON.stringify({ type: "disconnected", id: id }));
        }
        console.log(rooms);
    });
    //on timeout
    ws.on('timeout', function () {
        if (!ROOM_INDEX) return; //if the client didn't send a login message he never joined a room... so there's nothing to do
        //remove the client from the array
        for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
            if (rooms[ROOM_INDEX][i].id == id) {
                rooms[ROOM_INDEX].splice(i, 1);
            }
        }
        //notify all clients in that room that the client disconnected
        for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
            rooms[ROOM_INDEX][i].ws.send(JSON.stringify({ type: "disconnected", id: id }));
        }
    });
    //on error
    ws.on('error', function () {
        if (!ROOM_INDEX) return; //if the client didn't send a login message he never joined a room... so there's nothing to do
        //remove the client from the array
        for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
            if (rooms[ROOM_INDEX][i].id == id) {
                rooms[ROOM_INDEX].splice(i, 1);
            }
        }
        //notify all rooms in that room that the client disconnected
        for (var i = 1; i < rooms[ROOM_INDEX].length; i++) {
            rooms[ROOM_INDEX][i].ws.send(JSON.stringify({ type: "disconnected", id: id }));
        }
    });
});